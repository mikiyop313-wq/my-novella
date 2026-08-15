import fs from 'fs';
import path from 'path';

// Define the path for the development vector database
const vectorDbPath = path.join(process.cwd(), '.data', 'vectors');

console.log('Attempting to reset LanceDB schema and data...');

if (fs.existsSync(vectorDbPath)) {
    try {
        fs.rmSync(vectorDbPath, { recursive: true, force: true });
        console.log(`✅ Successfully deleted LanceDB vector data at: ${vectorDbPath}`);
        console.log('The schema and database will be recreated automatically on the next application run.');
    } catch (error) {
        console.error(`❌ Failed to delete vector data at ${vectorDbPath}:`, error.message);
        console.error('Make sure the application is closed before running this command.');
    }
} else {
    console.log(`ℹ️ Vector DB directory does not exist at: ${vectorDbPath}`);
    console.log('Nothing to reset.');
}
