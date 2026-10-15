import {app,BrowserWindow} from 'electron';
import path from 'node:path';
app.whenReady().then(()=>{const win=new BrowserWindow({width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(process.env.ELECTRON_RENDERER_URL)win.loadURL(process.env.ELECTRON_RENDERER_URL);else win.loadFile(path.join(__dirname,'../renderer/index.html'));});
app.on('window-all-closed',()=>app.quit());
