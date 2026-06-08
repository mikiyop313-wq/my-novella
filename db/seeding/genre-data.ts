export interface GenreData {
  name: string;
  subgenres: string[];
}

export const GENRES_DATA: GenreData[] = [
  {
    name: 'Fiction',
    subgenres: [
      'Literary fiction', 'Commercial fiction', 'Upmarket fiction', "Women's fiction",
      'Family saga', 'Domestic fiction', 'Satirical fiction', 'Epistolary fiction',
      'Metafiction', 'Experimental fiction', 'Absurdist fiction', 'Magical realism',
      'Fabulism', 'Transgressive fiction', 'Southern gothic', 'Gothic fiction',
      'Picaresque', 'Bildungsroman', 'Kunstlerroman', 'Philosophical fiction'
    ]
  },
  {
    name: 'Romance',
    subgenres: [
      'Contemporary romance', 'Historical romance', 'Regency romance', 'Paranormal romance',
      'Romantic suspense', 'Erotic romance', 'New adult romance', 'Young adult romance',
      'Sports romance', 'Small-town romance', 'Second-chance romance', 'Enemies-to-lovers',
      'Fake dating', 'Forced proximity', 'Dark romance', 'Inspirational romance',
      'Interracial romance', 'LGBTQ+ romance', 'Workplace romance', 'Military romance',
      'Billionaire romance', 'Cowboy / Western romance', 'Medical romance', 'Holiday romance'
    ]
  },
  {
    name: 'Science Fiction',
    subgenres: [
      'Hard science fiction', 'Soft science fiction', 'Space opera', 'Cyberpunk',
      'Steampunk', 'Dieselpunk', 'Biopunk', 'Solarpunk', 'Post-apocalyptic',
      'Dystopian', 'Utopian', 'Time travel', 'Alternate history', 'First contact',
      'Military science fiction', 'Generation ship', 'Climate fiction (Cli-fi)',
      'Science fantasy', 'LitRPG', 'Grimdark SF', 'Colonization fiction',
      'Galactic empire', 'Artificial intelligence fiction', 'Alien invasion'
    ]
  },
  {
    name: 'Fantasy',
    subgenres: [
      'High fantasy', 'Low fantasy', 'Epic fantasy', 'Dark fantasy', 'Urban fantasy',
      'Portal fantasy', 'Sword & sorcery', 'Heroic fantasy', 'Mythic fantasy',
      'Gaslamp fantasy', 'Flintlock fantasy', 'Romantic fantasy', 'Progression fantasy',
      'LitRPG fantasy', 'Cozy fantasy', 'Fairy tale retelling', 'Mythology retelling',
      'Secondary world fantasy', 'Grimdark fantasy', 'Isekai', 'Noblebright',
      'Fae fiction', 'Dragon fiction', 'Wuxia / Xianxia', 'Dungeon fantasy'
    ]
  },
  {
    name: 'Horror',
    subgenres: [
      'Supernatural horror', 'Psychological horror', 'Cosmic horror (Lovecraftian)',
      'Body horror', 'Slasher fiction', 'Gothic horror', 'Quiet horror', 'Folk horror',
      'Splatterpunk', 'Paranormal horror', 'Occult horror', 'Creature horror',
      'Haunted house', 'Survival horror', 'Zombie fiction', 'Vampire fiction',
      'Werewolf fiction', 'Demonic fiction', 'Horror comedy'
    ]
  },
  {
    name: 'Thriller & Suspense',
    subgenres: [
      'Psychological thriller', 'Legal thriller', 'Medical thriller', 'Political thriller',
      'Spy thriller', 'Techno-thriller', 'Financial thriller', 'Military thriller',
      'Domestic thriller', 'Crime thriller', 'Eco-thriller', 'Action thriller',
      'Conspiracy thriller', 'Survival thriller', 'Supernatural thriller'
    ]
  },
  {
    name: 'Mystery & Crime',
    subgenres: [
      'Cozy mystery', 'Hard-boiled', 'Noir', 'Police procedural', 'Amateur sleuth',
      'Detective fiction', 'Whodunit', 'Heist fiction', 'True crime narrative',
      'Historical mystery', 'Forensic mystery', 'Culinary mystery', 'Cat mystery',
      'Legal mystery', 'Caper', 'Inverted detective', 'Howdunit', 'Locked-room mystery'
    ]
  },
  {
    name: 'Historical Fiction',
    subgenres: [
      'Ancient world fiction', 'Medieval fiction', 'Renaissance fiction', 'Victorian fiction',
      'World War I fiction', 'World War II fiction', 'Cold War fiction', 'Frontier / Western fiction',
      'Ancient Rome fiction', 'Ancient Egypt fiction', 'Feudal Japan fiction', 'Colonial fiction',
      'Biographical fiction', 'Nautical historical fiction'
    ]
  },
  {
    name: 'Young Adult (YA)',
    subgenres: [
      'YA fantasy', 'YA science fiction', 'YA contemporary', 'YA romance', 'YA horror',
      'YA thriller', 'YA historical fiction', 'YA dystopian', 'YA mystery', 'YA LGBTQ+',
      'YA sports fiction', 'Clean teen fiction'
    ]
  },
  {
    name: 'Middle Grade (MG)',
    subgenres: [
      'MG adventure', 'MG fantasy', 'MG science fiction', 'MG contemporary', 'MG mystery',
      'MG historical fiction', 'MG horror / scary stories', 'MG humor', 'MG sports fiction'
    ]
  },
  {
    name: "Children's",
    subgenres: [
      'Picture books', 'Early readers', 'Chapter books', 'Bedtime stories', 'Animal stories',
      'Adventure stories', 'Fable & folklore', 'Educational picture books',
      'Wordless picture books', 'Board books'
    ]
  },
  {
    name: 'Graphic Novels & Comics',
    subgenres: [
      'Superhero comics', 'Manga', 'Manhwa / Manhua', 'Literary graphic novel',
      'Memoir in comics', 'Fantasy graphic novel', 'Horror comics', 'Romance comics',
      'Science fiction comics', 'Crime comics', 'Slice of life comics', 'Anthology comics'
    ]
  },
  {
    name: 'Literary Nonfiction',
    subgenres: [
      'Personal essay collection', 'Long-form journalism', 'New journalism',
      'Narrative nonfiction', 'Cultural criticism', 'Literary criticism', 'Lyric essay',
      'Travel writing', 'Nature writing', 'Food writing', 'Immersion journalism'
    ]
  },
  {
    name: 'Memoir & Biography',
    subgenres: [
      'Memoir', 'Autobiography', 'Biography', 'Micro-memoir', 'Celebrity memoir',
      'Political memoir', 'Military memoir', 'Addiction memoir', 'Recovery memoir',
      'Spiritual memoir', 'Grief memoir', 'Immigrant memoir', 'Trauma memoir',
      'Business biography', 'Sports biography', 'Creative nonfiction biography'
    ]
  },
  {
    name: 'Self-Help & Personal Development',
    subgenres: [
      'Motivation & mindset', 'Productivity', 'Habits & behavior change',
      'Relationships & communication', 'Parenting', 'Health & wellness', 'Mental health',
      'Finance & wealth', 'Leadership', 'Career development', 'Spiritual growth',
      'Grief & loss', 'Recovery', 'Dating & love'
    ]
  },
  {
    name: 'History',
    subgenres: [
      'Military history', 'Social history', 'Political history', 'Economic history',
      'Cultural history', 'World history', 'Ancient history', 'Medieval history',
      'Modern history', 'Revisionist history', 'Microhistory', 'Oral history',
      'History of science', 'Colonial & postcolonial history', 'Biography-as-history'
    ]
  },
  {
    name: 'Science & Nature',
    subgenres: [
      'Popular science', 'Physics', 'Biology', 'Chemistry', 'Earth science',
      'Astronomy & cosmology', 'Mathematics', 'Neuroscience', 'Genetics',
      'Ecology & environment', 'Zoology', 'Botany', 'Oceanography',
      'Climate & weather', 'Anthropology', 'Archaeology'
    ]
  },
  {
    name: 'Politics & Society',
    subgenres: [
      'Political theory', 'Public policy', 'International relations', 'Economics',
      'Sociology', 'Philosophy', 'Social justice', 'Race & ethnicity', 'Gender studies',
      'Feminism', 'Immigration', 'Criminal justice', 'Media studies', 'Urban studies',
      'Human rights'
    ]
  },
  {
    name: 'Religion & Spirituality',
    subgenres: [
      'Christian living', 'Biblical studies', 'Islamic texts', 'Jewish texts',
      'Buddhist texts', 'Hindu texts', 'New Age', 'Mysticism', 'Theology',
      'Philosophy of religion', 'Comparative religion', 'Inspirational / devotional',
      'Prayer & meditation', 'Afterlife & metaphysics'
    ]
  },
  {
    name: 'Business & Economics',
    subgenres: [
      'Entrepreneurship', 'Management', 'Marketing', 'Sales', 'Investing',
      'Personal finance', 'Economics', 'Corporate history', 'Innovation', 'Strategy',
      'Organizational behavior', 'Leadership', 'Startup culture', 'Case studies'
    ]
  },
  {
    name: 'Philosophy',
    subgenres: [
      'Western philosophy', 'Eastern philosophy', 'Ethics', 'Logic', 'Epistemology',
      'Metaphysics', 'Political philosophy', 'Philosophy of mind', 'Existentialism',
      'Stoicism', 'Phenomenology', 'Analytic philosophy', 'Continental philosophy'
    ]
  },
  {
    name: 'Travel',
    subgenres: [
      'Adventure travel', 'Solo travel', 'Budget travel', 'Luxury travel',
      'Cultural travel', 'Expat memoir', 'Road trip', 'Pilgrimage', 'Armchair travel',
      'Travel guides', 'Destination narrative', 'Food travel'
    ]
  },
  {
    name: 'True Crime',
    subgenres: [
      'Murder cases', 'Cold cases', 'Serial killer profiles', 'Investigative journalism',
      'Prison narratives', 'White-collar crime', 'Heist stories', 'Cult stories',
      'Missing persons'
    ]
  },
  {
    name: 'Poetry',
    subgenres: [
      'Epic poetry', 'Lyric poetry', 'Narrative poetry', 'Confessional poetry',
      'Spoken word', 'Haiku', 'Sonnet collections', 'Free verse', 'Concrete poetry',
      'Prose poetry', 'Experimental poetry', 'Political poetry'
    ]
  },
  {
    name: 'Drama & Plays',
    subgenres: [
      'Stage plays', 'Screenplays', 'Radio plays', 'One-act plays', 'Tragedy', 'Comedy',
      'Tragicomedy', 'Political drama', 'Historical drama', 'Absurdist theatre'
    ]
  },
  {
    name: 'Short Stories & Anthologies',
    subgenres: [
      'Short story collection', 'Flash fiction', 'Micro-fiction', 'Genre anthology',
      'Literary anthology', 'Horror anthology', 'Science fiction anthology',
      'Fantasy anthology', 'Linked stories / story cycle'
    ]
  },
  {
    name: 'Humor & Comedy',
    subgenres: [
      'Satire', 'Parody', 'Absurdist humor', 'Essay comedy', 'Comic novel',
      'Humorous nonfiction', 'Dark comedy', 'Wit & wordplay'
    ]
  },
  {
    name: 'Western',
    subgenres: [
      'Classic Western', 'Revisionist Western', 'Western romance', 'Weird West',
      'Contemporary Western', 'Historical Western', 'Native American Western'
    ]
  },
  {
    name: 'Adventure',
    subgenres: [
      'Action adventure', 'Survival fiction', 'Sea adventure', 'Jungle adventure',
      'Arctic / wilderness adventure', 'Treasure hunt', 'Swashbuckler', 'Lost world fiction'
    ]
  },
  {
    name: 'Sports',
    subgenres: [
      'Sports biography', 'Sports history', 'Sports fiction', 'Sports strategy',
      'Sports culture', 'Sports psychology', 'Individual sport narratives',
      'Team sport narratives'
    ]
  },
  {
    name: 'Food & Cooking',
    subgenres: [
      'Cookbook', 'Food memoir', 'Culinary history', 'Food culture', 'Baking books',
      'Regional cuisine', 'Nutrition', 'Food science', 'Plant-based cooking',
      'Cocktails & beverages'
    ]
  },
  {
    name: 'Art & Photography',
    subgenres: [
      'Art history', 'Art theory', 'Artist biography', 'Photography books',
      'Illustrated art books', 'Architecture', 'Design', 'Fashion', 'Film studies',
      'Music books'
    ]
  },
  {
    name: 'Technology & Computing',
    subgenres: [
      'Programming', 'Artificial intelligence', 'Cybersecurity', 'Data science',
      'Internet culture', 'Hacking', 'Tech biography', 'Robotics', 'Tech history',
      'Digital culture'
    ]
  },
  {
    name: 'Education & Reference',
    subgenres: [
      'Textbook', 'Encyclopedia', 'Dictionary', 'Academic journal', 'Study guide',
      'Language learning', 'Test prep', 'How-to / instructional', 'Almanac', 'Atlas'
    ]
  },
  {
    name: 'LGBTQ+ Fiction',
    subgenres: [
      'Gay fiction', 'Lesbian fiction', 'Bisexual fiction', 'Trans fiction',
      'Queer fiction', 'Non-binary fiction', 'LGBTQ+ romance', 'LGBTQ+ YA',
      'Queer speculative fiction', 'Coming-out narrative'
    ]
  }
];
