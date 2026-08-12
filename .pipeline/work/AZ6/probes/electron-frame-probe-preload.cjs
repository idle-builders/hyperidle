const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("__HYPERIDLE__", {
  apiKey: "SECRET-API-KEY-FROM-PRELOAD",
  platform: "electron",
  credentials: { get: (n) => ipcRenderer.invoke("credentials:get", n) },
});
