// Vercel Function entry: every request is rewritten here (see vercel.json).
// `npm run build` compiles src/ to dist/ first; the Express app is the request handler.
export { default } from '../dist/app.js';
