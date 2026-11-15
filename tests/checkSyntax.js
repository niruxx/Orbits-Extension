// Parse modules without executing GNOME Shell imports outside the compositor.
import Gio from 'gi://Gio';
for (const path of ARGV) {
    const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
    try {
        Reflect.parse(new TextDecoder().decode(bytes), {target: 'module'});
    } catch (error) {
        throw new Error(`${path}: ${error.message}`);
    }
}
print(`JavaScript module syntax OK (${ARGV.length} files)`);
