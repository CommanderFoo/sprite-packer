const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	select_folder: () => ipcRenderer.invoke("select-folder"),
	add_files: () => ipcRenderer.invoke("add-files"),
	load_images: (folderPath) => ipcRenderer.invoke("load-images", folderPath),
	load_image: (filePath) => ipcRenderer.invoke("load-image", filePath),
	pack_texture: (options) => ipcRenderer.invoke("pack-texture", options),
	save_atlas: (options) => ipcRenderer.invoke("save-atlas", options),
	read_file: (filePath) => ipcRenderer.invoke("read-file", filePath),
	get_recent_folders: () => ipcRenderer.invoke("get-recent-folders"),
	add_recent_folder: (folder) => ipcRenderer.invoke("add-recent-folder", folder),
	toggle_dark_mode: () => ipcRenderer.invoke("toggle-dark-mode"),
	get_theme: () => ipcRenderer.invoke("get-theme"),
	get_file_stats: (filePath) => ipcRenderer.invoke("get-file-stats", filePath),
	get_image_preview: (filePath) => ipcRenderer.invoke("get-image-preview", filePath),
	set_atlas_zoom: (zoomFactor) => ipcRenderer.invoke("set-atlas-zoom", zoomFactor),
	get_atlas_zoom: () => ipcRenderer.invoke("get-atlas-zoom"),
	save_project: (projectData) => ipcRenderer.invoke("save-project", projectData),
	load_project: () => ipcRenderer.invoke("load-project"),
	open_external: (url) => ipcRenderer.invoke("open-external", url),
	select_format: () => ipcRenderer.invoke("select-format"),
});