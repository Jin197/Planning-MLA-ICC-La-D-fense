/**
 * Vide la demonstration locale. Usage : npm run reset:demo
 */
import { emptySnapshot, persistPath, replaceSnapshot } from "../src/server/data/demo/store";

replaceSnapshot(emptySnapshot());
console.log(`Demonstration remise a zero : ${persistPath()}`);
