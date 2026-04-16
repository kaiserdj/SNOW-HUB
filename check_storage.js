
const Store = require('electron-store');
const store = new Store();
console.log("Store Path:", store.path);
console.log("Full Store Content:");
console.log(JSON.stringify(store.store, null, 2));
