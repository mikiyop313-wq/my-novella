import { db } from './index';
import { language, categories, subcategories } from './schema/book';
import { GENRES_DATA } from './genre-data';
import { TROPES_DATA } from './trope-data';
import { eq, and, sql } from 'drizzle-orm';

export const LANGUAGES = [
    'Afrikaans', 'Albanian', 'Amharic', 'Arabic', 'Armenian', 'Azerbaijani',
    'Basque', 'Belarusian', 'Bengali', 'Bosnian', 'Bulgarian', 'Burmese',
    'Catalan', 'Cebuano', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Corsican', 'Croatian', 'Czech',
    'Danish', 'Dutch',
    'English', 'Esperanto', 'Estonian',
    'Filipino (Tagalog)', 'Finnish', 'French', 'Frisian',
    'Galician', 'Georgian', 'German', 'Greek', 'Gujarati',
    'Haitian Creole', 'Hausa', 'Hawaiian', 'Hebrew', 'Hindi', 'Hmong', 'Hungarian',
    'Icelandic', 'Igbo', 'Indonesian', 'Irish', 'Italian',
    'Japanese', 'Javanese',
    'Kannada', 'Kazakh', 'Khmer', 'Kinyarwanda', 'Korean', 'Kurdish (Kurmanji)', 'Kyrgyz',
    'Lao', 'Latin', 'Latvian', 'Lithuanian', 'Luxembourgish',
    'Macedonian', 'Malagasy', 'Malay', 'Malayalam', 'Maltese', 'Maori', 'Marathi', 'Mongolian',
    'Nepali', 'Norwegian (Bokmål)', 'Norwegian (Nynorsk)',
    'Odia (Oriya)',
    'Pashto', 'Persian (Farsi)', 'Polish', 'Portuguese (Brazil)', 'Portuguese (Portugal)', 'Punjabi',
    'Romanian', 'Russian',
    'Samoan', 'Scottish Gaelic', 'Serbian', 'Sesotho', 'Shona', 'Sindhi', 'Sinhala', 'Slovak', 'Slovenian', 'Somali', 'Spanish', 'Sundanese', 'Swahili', 'Swedish',
    'Tajik', 'Tamil', 'Tatar', 'Telugu', 'Thai', 'Turkish', 'Turkmen',
    'Ukrainian', 'Urdu', 'Uyghur', 'Uzbek',
    'Vietnamese',
    'Welsh',
    'Xhosa',
    'Yiddish', 'Yoruba',
    'Zulu'
];

export async function seedLanguages() {
    console.log('Seeding languages...');
    try {
        const existingLanguages = await db.select().from(language);
        if (existingLanguages.length === 0) {
            console.log('Inserting languages into database...');
            await db.insert(language).values(
                LANGUAGES.map(lang => ({ languageName: lang.toLowerCase() }))
            ).onConflictDoNothing();
            console.log('Languages seeded successfully.');
        } else {
            console.log('Languages already exist, skipping seed.');
        }
    } catch (error) {
        console.error('Error seeding languages:', error);
    }
}

export async function seedGenres() {
    console.log('Seeding genres and subgenres...');
    try {
        // Calculate expected counts
        const expectedGenreCount = GENRES_DATA.length;
        const expectedSubgenreCount = GENRES_DATA.reduce((acc, genre) => acc + genre.subgenres.length, 0);

        // Get current counts of non-custom genres and subgenres
        const currentGenres = await db.select().from(categories).where(
            and(eq(categories.type, 'genre'), eq(categories.isCustom, false))
        );
        const currentSubgenresResult = await db.select({ count: sql<number>`count(*)` })
            .from(subcategories)
            .innerJoin(categories, eq(subcategories.parentCategoryId, categories.id))
            .where(and(eq(categories.type, 'genre'), eq(subcategories.isCustom, false)));

        const currentSubgenreCount = currentSubgenresResult[0]?.count ?? 0;

        if (currentGenres.length === expectedGenreCount && currentSubgenreCount === expectedSubgenreCount) {
            console.log('Genres and subgenres already up to date, skipping seed.');
            return;
        }

        console.log(`Counts mismatch (Genres: ${currentGenres.length}/${expectedGenreCount}, Subgenres: ${currentSubgenreCount}/${expectedSubgenreCount}). Re-seeding...`);

        // Delete existing non-custom genres (cascades to subcategories)
        await db.delete(categories).where(
            and(eq(categories.type, 'genre'), eq(categories.isCustom, false))
        );

        // Re-insert all from GENRES_DATA
        for (const genre of GENRES_DATA) {
            const [newCategory] = await db.insert(categories).values({
                name: genre.name,
                type: 'genre',
                isCustom: false
            }).returning();

            if (genre.subgenres.length > 0) {
                await db.insert(subcategories).values(
                    genre.subgenres.map(sub => ({
                        name: sub,
                        parentCategoryId: newCategory.id,
                        isCustom: false
                    }))
                );
            }
        }
        console.log('Genres and subgenres seeded successfully.');
    } catch (error) {
        console.error('Error seeding genres:', error);
    }
}

export async function seedTropes() {
    console.log('Seeding tropes and subtropes...');
    try {
        // Calculate expected counts
        const expectedTropeCount = TROPES_DATA.length;
        const expectedSubtropeCount = TROPES_DATA.reduce((acc, trope) => acc + trope.subtropes.length, 0);

        // Get current counts of non-custom tropes and subtropes
        const currentTropes = await db.select().from(categories).where(
            and(eq(categories.type, 'trope'), eq(categories.isCustom, false))
        );
        
        // Subcategories for tropes are also in the subcategories table, linked to trope categories
        const currentSubtropes = await db.select({ count: sql<number>`count(*)` })
            .from(subcategories)
            .innerJoin(categories, eq(subcategories.parentCategoryId, categories.id))
            .where(and(eq(categories.type, 'trope'), eq(subcategories.isCustom, false)));

        const subtropeCount = currentSubtropes[0]?.count ?? 0;

        if (currentTropes.length === expectedTropeCount && subtropeCount === expectedSubtropeCount) {
            console.log('Tropes and subtropes already up to date, skipping seed.');
            return;
        }

        console.log(`Counts mismatch (Tropes: ${currentTropes.length}/${expectedTropeCount}, Subtropes: ${subtropeCount}/${expectedSubtropeCount}). Re-seeding...`);

        // Delete existing non-custom tropes (cascades to subcategories)
        await db.delete(categories).where(
            and(eq(categories.type, 'trope'), eq(categories.isCustom, false))
        );

        // Re-insert all from TROPES_DATA
        for (const trope of TROPES_DATA) {
            const [newCategory] = await db.insert(categories).values({
                name: trope.name,
                type: 'trope',
                isCustom: false
            }).returning();

            if (trope.subtropes.length > 0) {
                await db.insert(subcategories).values(
                    trope.subtropes.map(sub => ({
                        name: sub,
                        parentCategoryId: newCategory.id,
                        isCustom: false
                    }))
                );
            }
        }
        console.log('Tropes and subtropes seeded successfully.');
    } catch (error) {
        console.error('Error seeding tropes:', error);
    }
}
