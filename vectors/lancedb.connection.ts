/**
 * Owns the LanceDB connection and isolates manuscript records by embedding space.
 *
 * @packageDocumentation
 */

import * as lancedb from '@lancedb/lancedb';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import type {
    EmbeddingSpaceDescriptor,
    ManuscriptVectorRecord,
} from '../shared/models/vector.model';
import {
    tableNameForEmbeddingSpace,
} from './embedding-space';

const isDev = process.env['NODE_ENV'] === 'development';
const vectorDbPath = (isDev || !app)
    ? '.data/vectors'
    : path.join(app.getPath('userData'), 'vectors');
const MANUSCRIPT_TABLE_PREFIX = 'manuscript_';
const LEGACY_MANUSCRIPT_TABLE = 'manuscript';

if (!fs.existsSync(vectorDbPath)) {
    fs.mkdirSync(vectorDbPath, { recursive: true });
}

export type { ManuscriptVectorRecord } from '../shared/models/vector.model';

export { embeddingSpaceId } from './embedding-space';

/** Escapes a string value before interpolation into a LanceDB SQL predicate. */
export function escapeLanceSql(value: string): string {
    return value.replace(/'/g, "''");
}

/** Provides connection and table lifecycle operations for manuscript vectors. */
export class VectorDatabase {
    private static instance: VectorDatabase;
    private db: lancedb.Connection | null = null;

    private constructor() {}

    /** Returns the process-wide vector database instance. */
    public static getInstance(): VectorDatabase {
        if (!VectorDatabase.instance) {
            VectorDatabase.instance = new VectorDatabase();
        }
        return VectorDatabase.instance;
    }

    /** Opens the configured LanceDB directory once and reuses the connection. */
    public async connect(): Promise<lancedb.Connection> {
        if (this.db) return this.db;

        this.db = await lancedb.connect(vectorDbPath);
        console.log('Successfully connected to LanceDB at:', vectorDbPath);
        return this.db;
    }

    /** Derives the stable manuscript table name for an embedding space. */
    public tableNameForSpace(space: EmbeddingSpaceDescriptor): string {
        return tableNameForEmbeddingSpace(space);
    }

    /**
     * Opens an embedding space's manuscript table or creates it from the record shape.
     *
     * @param space - Provider, model, dimensions, and revision defining vector compatibility.
     */
    public async getManuscriptTable(space: EmbeddingSpaceDescriptor) {
        const conn = await this.connect();
        const tableName = this.tableNameForSpace(space);
        const tableNames = await conn.tableNames();

        if (tableNames.includes(tableName)) {
            return conn.openTable(tableName);
        }

        const now = Date.now();
        const schemaRecord: ManuscriptVectorRecord = {
            id: '__schema__',
            bookId: '__schema__',
            actId: '__schema__',
            chapterId: '__schema__',
            sceneId: '__schema__',
            text: '',
            vector: new Array(space.dimensions).fill(0),
            provider: space.provider,
            model: space.model,
            revision: space.revision,
            hash: '',
            position: 0,
            charCount: 0,
            createdAt: now,
            updatedAt: now,
        };

        return conn.createTable(
            tableName,
            [schemaRecord as unknown as Record<string, unknown>],
        );
    }

    /** Removes one book's records from every manuscript space except its active space. */
    public async deleteBookFromOtherSpaces(
        bookId: string,
        activeSpace: EmbeddingSpaceDescriptor,
    ): Promise<void> {
        const conn = await this.connect();
        const activeTable = this.tableNameForSpace(activeSpace);
        const predicate = `bookId = '${escapeLanceSql(bookId)}'`;

        for (const tableName of await conn.tableNames()) {
            if (!tableName.startsWith(MANUSCRIPT_TABLE_PREFIX) || tableName === activeTable) {
                continue;
            }
            const table = await conn.openTable(tableName);
            await table.delete(predicate);
        }
    }

    /**
     * Drops only the table derived from the supplied exact embedding-space descriptor.
     *
     * @param space - Provider, model, dimensions, and revision whose vectors should be removed.
     */
    public async dropEmbeddingSpace(space: EmbeddingSpaceDescriptor): Promise<void> {
        const conn = await this.connect();
        const tableName = this.tableNameForSpace(space);
        if ((await conn.tableNames()).includes(tableName)) {
            await conn.dropTable(tableName);
        }
    }

    /** Removes the obsolete shared manuscript table when it is still present. */
    public async retireLegacyManuscriptTable(): Promise<void> {
        const conn = await this.connect();
        if ((await conn.tableNames()).includes(LEGACY_MANUSCRIPT_TABLE)) {
            await conn.dropTable(LEGACY_MANUSCRIPT_TABLE);
        }
    }
}

/** Process-wide LanceDB facade used by repositories and lifecycle services. */
export const vectorDb = VectorDatabase.getInstance();
