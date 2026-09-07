"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Safe, minimal bridge between the crab UI and the main process.
contextBridge.exposeInMainWorld("crab", {
  // Ask main for the latest tracked stats immediately.
  requestStats: () => ipcRenderer.send("crab:request-stats"),
  // Receive stats pushes from main (initial load, polls, manual refresh).
  onStats: (cb) => {
    ipcRenderer.on("crab:stats", (_e, data) => cb(data));
  },
  // Tell main to hide the pet (e.g. user clicked the close dot).
  hide: () => ipcRenderer.send("crab:hide"),
});

// First-run setup bridge (used only by onboard.html).
contextBridge.exposeInMainWorld("crabSetup", {
  // Detected git email + home dir, to pre-fill the form.
  defaults: () => ipcRenderer.invoke("onboard:defaults"),
  // Open a native folder picker; resolves to a path or null.
  pickFolder: () => ipcRenderer.invoke("onboard:pick-folder"),
  // Save the config and launch the pet.
  submit: (data) => ipcRenderer.invoke("onboard:submit", data),
});
