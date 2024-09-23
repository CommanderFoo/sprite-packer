const { app, BrowserWindow, ipcMain, dialog, nativeTheme, webContents, shell } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");

let store;
let main_window;

async function initialize_store() {
	const { default: Store } = await import("electron-store");
	store = new Store();
}

function create_window() {
	// Increase window size by 20%
	const width = Math.round(1200 * 1.2);
	const height = Math.round(800 * 1.2);

	main_window = new BrowserWindow({
		width: width,
		height: height,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "preload.js"),
			// Add this line to set a Content Security Policy
			contentSecurityPolicy: "default-src 'self'; script-src 'self'"
		},
	});

	//main_window.setMenuBarVisibility(false);
	main_window.loadFile("index.html");

	// Set the theme based on the stored value or system preference
	const is_dark_mode = store.get("dark_mode", nativeTheme.shouldUseDarkColors);
	nativeTheme.themeSource = is_dark_mode ? "dark" : "light";
}

// Set the app name
app.name = "Sprite Packer";

const compare_strings = (a, b) => {
	const a_chars = [...a];
	const b_chars = [...b];
	for (let i = 0; i < Math.min(a_chars.length, b_chars.length); i++) {
		if (a_chars[i] !== b_chars[i]) {
			return a_chars[i].localeCompare(b_chars[i]);
		}
	}
	return a_chars.length - b_chars.length;
};

app.whenReady().then(async () => {
	await initialize_store();
	create_window();

	ipcMain.handle("select-folder", async () => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (result.filePaths[0]) {
			await add_recent_folder(result.filePaths[0]);
		}
		return result.filePaths[0];
	});

	ipcMain.handle("load-images", async (event, folder_path) => {
		const files = await fs.readdir(folder_path);
		const image_files = files.filter(file =>
			[".png", ".jpg", ".jpeg"].includes(path.extname(file).toLowerCase())
		);
		const images_with_stats = await Promise.all(image_files.map(async file => {
			const file_path = path.join(folder_path, file);
			const stats = await fs.stat(file_path);
			return {
				path: file_path,
				name: path.parse(file).name,
				stats: {
					size: stats.size,
					birthtime: stats.birthtime,
					mtime: stats.mtime
				}
			};
		}));
		return images_with_stats;
	});

	ipcMain.handle("pack-texture", async (event, { image_paths, atlas_size, padding, sorting_method }) => {
		try {
			const images = await Promise.all(image_paths.map(async (path) => {
				const buffer = await fs.readFile(path);
				const stats = await fs.stat(path);
				const metadata = await sharp(buffer).metadata();
				return { path, buffer, stats, width: metadata.width, height: metadata.height };
			}));

			// Ensure atlas_size is within the supported range
			const max_size = 8192; // New maximum size
			if (atlas_size > max_size) {
				atlas_size = max_size;
			}

			// Custom packing algorithm
			const packed_rects = [];
			let current_x = padding;
			let current_y = padding;
			let row_height = 0;

			for (const img of images) {
				const width = img.width + padding * 2;
				const height = img.height + padding * 2;

				if (current_x + width > atlas_size) {
					// Move to the next row
					current_x = padding;
					current_y += row_height + padding;
					row_height = 0;
				}

				if (current_y + height > atlas_size) {
					continue;
				}

				packed_rects.push({
					x: current_x,
					y: current_y,
					width: img.width,
					height: img.height,
					data: img
				});

				current_x += width;
				row_height = Math.max(row_height, height);
			}

			return { packed_rects, images };
		} catch (error) {
			throw error;
		}
	});

	ipcMain.handle("save-atlas", async (event, { data_url, default_path, quality }) => {
		const result = await dialog.showSaveDialog({
			default_path,
			filters: [{ name: "PNG", extensions: ["png"] }]
		});
		if (!result.canceled) {
			const base64_data = data_url.replace(/^data:image\/png;base64,/, "");
			const buffer = Buffer.from(base64_data, "base64");
			const png_buffer = await sharp(buffer).png({ quality: Math.round(parseFloat(quality) * 100) }).toBuffer();
			await fs.writeFile(result.filePath, png_buffer, "base64");
			return result.filePath;
		}
	});

	ipcMain.handle("read-file", async (event, file_path) => {
		return await fs.readFile(file_path);
	});

	ipcMain.handle("get-recent-folders", () => {
		return store.get("recent_folders", []);
	});

	ipcMain.handle("add-recent-folder", (event, folder) => {
		return add_recent_folder(folder);
	});

	ipcMain.handle("toggle-dark-mode", () => {
		const is_dark_mode = nativeTheme.shouldUseDarkColors;
		nativeTheme.themeSource = is_dark_mode ? "light" : "dark";
		store.set("dark_mode", !is_dark_mode);
		return !is_dark_mode;
	});

	ipcMain.handle("get-theme", () => {
		return nativeTheme.shouldUseDarkColors;
	});

	ipcMain.handle("get-file-stats", async (event, file_path) => {
		return await fs.stat(file_path);
	});

	ipcMain.handle("get-image-preview", async (event, file_path) => {
		const buffer = await fs.readFile(file_path);
		const resized_buffer = await sharp(buffer)
			.resize(50, 50, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.toBuffer();
		return {
			preview: `data:image/png;base64,${resized_buffer.toString("base64")}`,
			name: path.parse(file_path).name // Return the filename without extension
		};
	});

	// Add these new IPC handlers for atlas zoom functionality
	ipcMain.handle("set-atlas-zoom", (event, zoom_factor) => {
		store.set("atlas_zoom_factor", zoom_factor);
		return zoom_factor;
	});

	ipcMain.handle("get-atlas-zoom", () => {
		return store.get("atlas_zoom_factor", 0.6); // Change default to 0.6 (60%)
	});

	// Add these new IPC handlers
	ipcMain.handle("save-project", async (event, project_data) => {
		const result = await dialog.showSaveDialog({
			title: "Save Project",
			default_path: "sprite_packer_project.json",
			filters: [{ name: "JSON", extensions: ["json"] }]
		});

		if (!result.canceled) {
			await fs.writeFile(result.filePath, JSON.stringify(project_data, null, 2));
			return result.filePath;
		}
	});

	ipcMain.handle("load-project", async () => {
		const result = await dialog.showOpenDialog({
			title: "Load Project",
			filters: [{ name: "JSON", extensions: ["json"] }],
			properties: ["openFile"]
		});

		if (!result.canceled && result.filePaths.length > 0) {
			const project_data = await fs.readFile(result.filePaths[0], "utf-8");
			return JSON.parse(project_data);
		}
	});

	ipcMain.handle("open-external", (event, url) => {
		shell.openExternal(url);
	});
});

async function add_recent_folder(folder) {
	let recent_folders = store.get("recent_folders", []);
	recent_folders = [folder, ...recent_folders.filter(f => f !== folder)].slice(0, 10);
	store.set("recent_folders", recent_folders);
	return recent_folders;
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) create_window();
});