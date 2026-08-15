import { db } from '../core/client';
import { language, categories, subcategories } from '../schema';
import { GENRES_DATA } from './genre-data';
import { TROPES_DATA } from './trope-data';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export const LANGUAGES = [
  'Afrikaans',
  'Albanian',
  'Amharic',
  'Arabic',
  'Armenian',
  'Azerbaijani',
  'Basque',
  'Belarusian',
  'Bengali',
  'Bosnian',
  'Bulgarian',
  'Burmese',
  'Catalan',
  'Cebuano',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Corsican',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'English',
  'Esperanto',
  'Estonian',
  'Filipino (Tagalog)',
  'Finnish',
  'French',
  'Frisian',
  'Galician',
  'Georgian',
  'German',
  'Greek',
  'Gujarati',
  'Haitian Creole',
  'Hausa',
  'Hawaiian',
  'Hebrew',
  'Hindi',
  'Hmong',
  'Hungarian',
  'Icelandic',
  'Igbo',
  'Indonesian',
  'Irish',
  'Italian',
  'Japanese',
  'Javanese',
  'Kannada',
  'Kazakh',
  'Khmer',
  'Kinyarwanda',
  'Korean',
  'Kurdish (Kurmanji)',
  'Kyrgyz',
  'Lao',
  'Latin',
  'Latvian',
  'Lithuanian',
  'Luxembourgish',
  'Macedonian',
  'Malagasy',
  'Malay',
  'Malayalam',
  'Maltese',
  'Maori',
  'Marathi',
  'Mongolian',
  'Nepali',
  'Norwegian (Bokmål)',
  'Norwegian (Nynorsk)',
  'Odia (Oriya)',
  'Pashto',
  'Persian (Farsi)',
  'Polish',
  'Portuguese (Brazil)',
  'Portuguese (Portugal)',
  'Punjabi',
  'Romanian',
  'Russian',
  'Samoan',
  'Scottish Gaelic',
  'Serbian',
  'Sesotho',
  'Shona',
  'Sindhi',
  'Sinhala',
  'Slovak',
  'Slovenian',
  'Somali',
  'Spanish',
  'Sundanese',
  'Swahili',
  'Swedish',
  'Tajik',
  'Tamil',
  'Tatar',
  'Telugu',
  'Thai',
  'Turkish',
  'Turkmen',
  'Ukrainian',
  'Urdu',
  'Uyghur',
  'Uzbek',
  'Vietnamese',
  'Welsh',
  'Xhosa',
  'Yiddish',
  'Yoruba',
  'Zulu',
];

const toLanguageRow = (languageName: string) => ({
  languageName: languageName.toLowerCase(),
});

export async function seedLanguages() {
  console.log('Seeding languages...');

  try {
    const existingLanguages = await db.select().from(language);

    if (existingLanguages.length === 0) {
      console.log('Inserting languages into database...');

      await db.insert(language).values(LANGUAGES.map(toLanguageRow)).onConflictDoNothing();

      console.log('Languages seeded successfully.');
    } else {
      console.log('Languages already exist, skipping seed.');
    }
  } catch (error) {
    console.error('Error seeding languages:', error);
  }
}

// ---------------------------------------------------------------------------
// Category catalogs
// ---------------------------------------------------------------------------

type CategoryType = 'genre' | 'trope';

interface CategorySeedItem {
  name: string;
  subcategories: string[];
}

interface CategorySeedConfig {
  type: CategoryType;
  parentLabelPlural: string;
  childLabelPlural: string;
  items: CategorySeedItem[];
}

const GENRE_SEED_ITEMS: CategorySeedItem[] = GENRES_DATA.map((genre) => ({
  name: genre.name,
  subcategories: genre.subgenres,
}));

const TROPE_SEED_ITEMS: CategorySeedItem[] = TROPES_DATA.map((trope) => ({
  name: trope.name,
  subcategories: trope.subtropes,
}));

async function countSeededSubcategories(type: CategoryType): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subcategories)
    .innerJoin(categories, eq(subcategories.parentCategoryId, categories.id))
    .where(and(eq(categories.type, type), eq(subcategories.isCustom, false)));

  return Number(result?.count ?? 0);
}

async function seedCategoryCatalog(config: CategorySeedConfig): Promise<void> {
  const expectedParentCount = config.items.length;
  const expectedChildCount = config.items.reduce(
    (count, item) => count + item.subcategories.length,
    0,
  );

  const currentParents = await db
    .select()
    .from(categories)
    .where(and(eq(categories.type, config.type), eq(categories.isCustom, false)));

  const currentChildCount = await countSeededSubcategories(config.type);

  if (currentParents.length === expectedParentCount && currentChildCount === expectedChildCount) {
    console.log(
      `${config.parentLabelPlural} and ${config.childLabelPlural} already up to date, skipping seed.`,
    );
    return;
  }

  console.log(
    `Counts mismatch (${config.parentLabelPlural}: ${currentParents.length}/${expectedParentCount}, ` +
      `${config.childLabelPlural}: ${currentChildCount}/${expectedChildCount}). Re-seeding...`,
  );

  // Custom user entries are preserved; generated entries are rebuilt so the
  // app reflects the current static catalog exactly.
  await db
    .delete(categories)
    .where(and(eq(categories.type, config.type), eq(categories.isCustom, false)));

  for (const item of config.items) {
    const [newCategory] = await db
      .insert(categories)
      .values({
        name: item.name,
        type: config.type,
        isCustom: false,
      })
      .returning();

    if (item.subcategories.length === 0) {
      continue;
    }

    await db.insert(subcategories).values(
      item.subcategories.map((name) => ({
        name,
        parentCategoryId: newCategory.id,
        isCustom: false,
      })),
    );
  }

  console.log(`${config.parentLabelPlural} and ${config.childLabelPlural} seeded successfully.`);
}

export async function seedGenres() {
  console.log('Seeding genres and subgenres...');

  try {
    await seedCategoryCatalog({
      type: 'genre',
      parentLabelPlural: 'Genres',
      childLabelPlural: 'Subgenres',
      items: GENRE_SEED_ITEMS,
    });
  } catch (error) {
    console.error('Error seeding genres:', error);
  }
}

export async function seedTropes() {
  console.log('Seeding tropes and subtropes...');

  try {
    await seedCategoryCatalog({
      type: 'trope',
      parentLabelPlural: 'Tropes',
      childLabelPlural: 'Subtropes',
      items: TROPE_SEED_ITEMS,
    });
  } catch (error) {
    console.error('Error seeding tropes:', error);
  }
}
