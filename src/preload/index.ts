import {contextBridge} from 'electron';
contextBridge.exposeInMainWorld('drama',{version:'0.1.0'});
