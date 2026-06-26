import path from 'path'

export const STORAGE_PATH = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.resolve(__dirname, '..', '..', 'uploads')
