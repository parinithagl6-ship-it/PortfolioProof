import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url))
export const envFilePath = path.resolve(sourceDirectory, '../../.env')

dotenv.config({ path: envFilePath })
