import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
const source = resolve(process.env.DATABASE_PATH || 'data/race.sqlite');
const destination = resolve(process.argv[2] || `backups/race-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
if (!existsSync(source)) throw new Error('Database does not exist');
if (existsSync(destination) || source === destination) throw new Error('Backup destination must be a new file');
mkdirSync(dirname(destination), {recursive:true,mode:0o700});
const db = new DatabaseSync(source, {readOnly:true});
try {await backup(db, destination);console.log(`Backup created: ${destination}`);} finally {db.close();}
