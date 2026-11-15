// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';

/** Cancel on every query, menu close, or privacy change. Late replies never reach actors. */
export class LauncherSearch {
    constructor(settings) {
        this.settings = settings;
        this.searchSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'});
        this.privacy = new Gio.Settings({schema_id: 'org.gnome.desktop.privacy'});
        this.searchSettings.connectObject('changed', () => this.invalidate(), this);
    }
    invalidate() { this.cancel(); this._providers = null; }
    _ready(proxy, cancel) {
        if (proxy.get_connection()) return Promise.resolve(true);
        if (cancel.is_cancelled()) return Promise.resolve(false);
        return new Promise(resolve => {
            // GNOME constructs provider proxies asynchronously. Calling before
            // initialization completes passes a null connection to GDBus.
            const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                if (!proxy.get_connection()) return GLib.SOURCE_CONTINUE;
                cancel.disconnect(signal); resolve(true); return GLib.SOURCE_REMOVE;
            });
            const signal = cancel.connect(() => { GLib.source_remove(timer); resolve(false); });
        });
    }
    cancel() {
        this._serial = (this._serial ?? 0) + 1;
        this._cancel?.cancel(); this._cancel = null;
        if (this._delay) { GLib.source_remove(this._delay); this._delay = 0; }
        if (this._timeout) { GLib.source_remove(this._timeout); this._timeout = 0; }
    }
    query(query, append) {
        this.cancel();
        if (!query) return;
        const serial = this._serial;
        this._cancel = new Gio.Cancellable();
        const cancel = this._cancel;
        this._delay = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
            this._delay = 0;
            this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => { this._timeout = 0; cancel.cancel(); return GLib.SOURCE_REMOVE; });
            const valid = () => serial === this._serial && !cancel.is_cancelled();
            this._run(query, cancel, (title, results, more) => { if (valid()) append(title, results, more); })
                .catch(error => { if (!cancel.is_cancelled()) console.warn(`Orbit search: ${error.message}`); })
                .finally(() => { if (serial === this._serial && this._timeout) { GLib.source_remove(this._timeout); this._timeout = 0; } });
            return GLib.SOURCE_REMOVE;
        });
    }
    async _run(query, cancel, append) {
        const terms = query.split(/\s+/);
        const tasks = [];
        if (this.settings.get_boolean('launcher-search-providers')) {
            const disabled = this.settings.get_strv('launcher-disabled-providers');
            const providers = this._providers ??= RemoteSearch.loadRemoteSearchProviders(this.searchSettings);
            for (const provider of providers.filter(item => !disabled.includes(item.id))) tasks.push((async () => {
                if (!await this._ready(provider.proxy, cancel) || cancel.is_cancelled()) return;
                const ids = await provider.getInitialResultSet(terms, cancel);
                if (cancel.is_cancelled()) return;
                const metas = await provider.getResultMetas(ids.slice(0, this.settings.get_int('launcher-provider-limit')), cancel);
                const results = metas.map(meta => ({id: `${provider.id}:${meta.id}`, name: meta.name, description: meta.description,
                    createIcon: meta.createIcon, activate: () => {
                        if (meta.clipboardText) StClipboard(meta.clipboardText);
                        provider.activateResult(meta.id, terms);
                    }}));
                append(provider.appInfo.get_name(), results, provider.canLaunchSearch ? () => provider.launchSearch(terms) : null);
            })());
        }
        if (this.settings.get_boolean('launcher-recent-files')) tasks.push(this.recent(cancel).then(items => {
            const matches = items.filter(item => terms.every(term => `${item.name} ${item.description}`.toLowerCase().includes(term)));
            append('Recent Files', matches);
        }));
        const outcomes = await Promise.allSettled(tasks);
        for (const outcome of outcomes) if (outcome.status === 'rejected' && !cancel.is_cancelled()) console.warn(`Orbit provider search: ${outcome.reason?.message ?? outcome.reason}`);
    }
    async recent(cancel = null) {
        if (!this.settings.get_boolean('launcher-recent-files') || !this.privacy.get_boolean('remember-recent-files')) return [];
        const file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']));
        return new Promise(resolve => {
            file.query_info_async('standard::size', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel, (f, r) => {
                try { if (f.query_info_finish(r).get_size() > 4 * 1024 * 1024) { resolve([]); return; } }
                catch { resolve([]); return; }
                f.load_contents_async(cancel, (source, result) => {
                    try {
                        const [, bytes] = source.load_contents_finish(result);
                        const book = new GLib.BookmarkFile(); book.load_from_data(new TextDecoder().decode(bytes), bytes.length);
                        const now = GLib.get_real_time() / 1000000;
                        const age = this.settings.get_int('launcher-recent-days') * 86400;
                        const items = book.get_uris().filter(uri => !book.get_is_private(uri)).map(uri => {
                            const time = book.get_modified_date_time(uri)?.to_unix() ?? 0;
                            const target = Gio.File.new_for_uri(uri);
                            return {id: uri, name: book.get_title(uri) || target.get_basename(), description: uri, time,
                                icon: 'text-x-generic-symbolic', activate: () => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1))};
                        }).filter(item => now - item.time <= age).sort((a, b) => b.time - a.time).slice(0, this.settings.get_int('launcher-recent-limit'));
                        resolve(items);
                    } catch { resolve([]); }
                });
            });
        });
    }
    destroy() { this.cancel(); this.searchSettings.disconnectObject(this); this._providers = null; }
}
// Importing St here keeps provider clipboard results consistent with GNOME search.
import St from 'gi://St';
function StClipboard(text) { St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text); }
