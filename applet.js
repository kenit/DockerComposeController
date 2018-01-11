const Applet = imports.ui.applet;
const Util = imports.misc.util;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const PopupMenu = imports.ui.popupMenu;

function MyApplet(metadata,orientation, panel_height, instance_id) {
    this._init(metadata,orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(metadata, orientation, panel_height, instance_id) {

        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

        this._path = metadata.path;
        this._bind_settings(instance_id);
        this._get_service_status();
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);
        this._setMenu();
    },

    on_applet_clicked: function() {
        this.menu.toggle();      
    },

    _bind_settings: function(instance_id) {
        let settings = new Settings.AppletSettings(
            this,
            "composectrl@kenit.cc",
            instance_id
        );

        settings.bindProperty(Settings.BindingDirection.IN,
            "composeFilePath",
            "composeFilePath",
            this._on_settings_changed,
            null
        );

        settings.bindProperty(Settings.BindingDirection.IN,
            "composeCmd",
            "composeCmd",
            this._on_settings_changed,
            null
        );

        settings.bindProperty(Settings.BindingDirection.IN,
            "composeProjectName",
            "composeProjectName",
            this._on_settings_changed,
            null
        );

        settings.bindProperty(Settings.BindingDirection.IN,
            "aliveContainerName",
            "aliveContainerName",
            this._on_settings_changed,
            null
        );     
    },
    _on_settings_changed: function(){
        let pattern = new RegExp('^file:\/\/');
        if(pattern.test(this.composeFilePath)){            
            this.composeFilePath = this.composeFilePath.replace(pattern, '');
            global.log(this.composeFilePath);
        }
    },
    _get_service_status: function(){
        const services = this._getServiceList();
        Promise.all(services.map((ele)=>{
            let cmd = [this.composeCmd, '-p', this.composeProjectName, '-f', this.composeFilePath, "exec", "-T", ele , "echo", "ok"];

            let [res, pid, in_fd, out_fd, err_fd]  = GLib.spawn_async_with_pipes(null, cmd, null, GLib.SpawnFlags.SEARCH_PATH, null);
            let out_reader = new Gio.DataInputStream({
                base_stream: new Gio.UnixInputStream({fd: out_fd})
            });
            let err_reader = new Gio.DataInputStream({
                base_stream: new Gio.UnixInputStream({fd: err_fd})
            });
            return new Promise((resolve, reject) => {
                let out_cancel = new Gio.Cancellable();
                let err_cancel = new Gio.Cancellable();
                let cb = (reader, res)=>{
                    let [out, length] = reader.read_upto_finish(res);
                    let result = out.toString().replace(/\W/g, '');
                    if(result == 'ok'){                        
                        resolve(result);
                        err_cancel.cancel();
                    }else{
                        reject(result);
                        out_reader.cancel();
                    }
                };
                out_reader.read_upto_async("", 0, 0, out_cancel, cb, "");
                err_reader.read_upto_async("", 0, 0, err_cancel, cb, "");
            });            
        })).then(() => {
            this._set_applet_status(true);
        }).catch(reason => {
            global.log(reason);
            this._set_applet_status(false);
        });
    },
    _set_applet_status: function(status){
        let icon_name = (status ? 'Unknown' : 'Stopped');
        this.set_applet_icon_path(this._path + '/icons/128/' + icon_name + '.png');
        this.set_applet_tooltip(_(status ? "All service are running" : "Partal or all service are down"));
    },
    _setMenu: function(){
        let upItem = new PopupMenu.PopupMenuItem(_("Up"));
        upItem.connect('activate', () => this._up());
        this.menu.addMenuItem(upItem);
        
        let downItem = new PopupMenu.PopupMenuItem(_("Down"));
        downItem.connect('activate', () => this._down());
        this.menu.addMenuItem(downItem);

        let restartItem = new PopupMenu.PopupMenuItem(_("Restart"));
        restartItem.connect('activate', () => this._restart());
        this.menu.addMenuItem(restartItem);

        let refreshItem = new PopupMenu.PopupMenuItem(_("Refresh"));
        refreshItem.connect('activate', () => this._check());
        this.menu.addMenuItem(refreshItem);
    },
    _down: function(){
        Util.spawn_async([this.composeCmd, '-p', this.composeProjectName, '-f', this.composeFilePath, 'down'], () => this._get_service_status());
    },
    _up: function(){
        Util.spawn_async([this.composeCmd, '-p', this.composeProjectName, '-f', this.composeFilePath, 'up', '-d'], () => this._get_service_status());
    },
    _restart: function(){
        Util.spawn_async([this.composeCmd, '-p', this.composeProjectName, '-f', this.composeFilePath, 'restart'], () => this._get_service_status());
    },
    _check: function(){
        this._get_service_status();
    },
    _getServiceList: function(){
        let cmd = [this.composeCmd, '-p', this.composeProjectName, '-f', this.composeFilePath, "config", "--service"];        
        let [res, out] = GLib.spawn_sync(null, cmd, null, GLib.SpawnFlags.SEARCH_PATH, null);
        return out.toString().trim().split("\n")
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(metadata, orientation, panel_height, instance_id);
}

