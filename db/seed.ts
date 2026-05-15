import { db } from './index';
import { language, categories, subcategories } from './schema/book';
import { GENRES_DATA } from './genre-data';

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
        console.log('Inserting genres and subgenres into database...');

        for (const genre of GENRES_DATA) {
            const [newCategory] = await db.insert(categories).values({
                name: genre.name,
                type: 'genre',
                isCustom: false
            }).onConflictDoNothing().returning();

            if (newCategory && genre.subgenres.length > 0) {
                await db.insert(subcategories).values(
                    genre.subgenres.map(sub => ({
                        name: sub,
                        parentCategoryId: newCategory.id,
                        isCustom: false
                    }))
                ).onConflictDoNothing();
            } else if (!newCategory) {
                // If category already existed but subcategories might be missing
                const existingCategory = await db.query.categories.findFirst({
                    where: (cats, { and, eq }) => and(eq(cats.name, genre.name), eq(cats.type, 'genre'))
                });

                if (existingCategory && genre.subgenres.length > 0) {
                    await db.insert(subcategories).values(
                        genre.subgenres.map(sub => ({
                            name: sub,
                            parentCategoryId: existingCategory.id,
                            isCustom: false
                        }))
                    ).onConflictDoNothing();
                }
            }
        }
        console.log('Genres and subgenres seed check completed.');
    } catch (error) {
        console.error('Error seeding genres:', error);
    }
}
