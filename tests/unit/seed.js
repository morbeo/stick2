// the seed of the randomized tests: fixed by default (every run is the same), SEED=n reruns with another, SEED=random picks a fresh one
// it is printed on every run, and a failing randomized check names it, so any failure can be replayed with SEED=n
// (each test file runs in its own process: with SEED=random each draws its own, so the line names the file)
const env = process.env.SEED;
const SEED = env === 'random' ? Math.floor(Math.random() * 2 ** 31) : env ? Number(env) : 1;
if (!Number.isSafeInteger(SEED)) throw new Error(`SEED must be a whole number or 'random', not ${env}`);
console.log(`seed ${SEED} for ${require('path').basename(require.main?.filename || '?')}${env ? '' : ' (default; SEED=n or SEED=random for others)'}`);
module.exports = SEED;
