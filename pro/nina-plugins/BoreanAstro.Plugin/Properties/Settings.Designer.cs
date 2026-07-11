//------------------------------------------------------------------------------
// Settings for Borean Astro NINA plugin.
//------------------------------------------------------------------------------

namespace BoreanAstro.Plugin.Properties {

    [global::System.Runtime.CompilerServices.CompilerGeneratedAttribute()]
    [global::System.CodeDom.Compiler.GeneratedCodeAttribute("Microsoft.VisualStudio.Editors.SettingsDesigner.SettingsSingleFileGenerator", "17.0.0.0")]
    internal sealed partial class Settings : global::System.Configuration.ApplicationSettingsBase {

        private static Settings defaultInstance = ((Settings)(global::System.Configuration.ApplicationSettingsBase.Synchronized(new Settings())));

        public static Settings Default {
            get {
                return defaultInstance;
            }
        }

        [global::System.Configuration.UserScopedSettingAttribute()]
        [global::System.Diagnostics.DebuggerNonUserCodeAttribute()]
        [global::System.Configuration.DefaultSettingValueAttribute("True")]
        public bool UpdateSettings {
            get {
                return ((bool)(this["UpdateSettings"]));
            }
            set {
                this["UpdateSettings"] = value;
            }
        }

        [global::System.Configuration.UserScopedSettingAttribute()]
        [global::System.Diagnostics.DebuggerNonUserCodeAttribute()]
        [global::System.Configuration.DefaultSettingValueAttribute("")]
        public string ApiEndpoint {
            get {
                return ((string)(this["ApiEndpoint"]));
            }
            set {
                this["ApiEndpoint"] = value;
            }
        }

        [global::System.Configuration.UserScopedSettingAttribute()]
        [global::System.Diagnostics.DebuggerNonUserCodeAttribute()]
        [global::System.Configuration.DefaultSettingValueAttribute("2000")]
        public int PostIntervalMilliseconds {
            get {
                return ((int)(this["PostIntervalMilliseconds"]));
            }
            set {
                this["PostIntervalMilliseconds"] = value;
            }
        }

        [global::System.Configuration.UserScopedSettingAttribute()]
        [global::System.Diagnostics.DebuggerNonUserCodeAttribute()]
        [global::System.Configuration.DefaultSettingValueAttribute("")]
        public string SharedSecret {
            get {
                return ((string)(this["SharedSecret"]));
            }
            set {
                this["SharedSecret"] = value;
            }
        }

        [global::System.Configuration.UserScopedSettingAttribute()]
        [global::System.Diagnostics.DebuggerNonUserCodeAttribute()]
        [global::System.Configuration.DefaultSettingValueAttribute("")]
        public string StationId {
            get {
                return ((string)(this["StationId"]));
            }
            set {
                this["StationId"] = value;
            }
        }

        [global::System.Configuration.UserScopedSettingAttribute()]
        [global::System.Diagnostics.DebuggerNonUserCodeAttribute()]
        [global::System.Configuration.DefaultSettingValueAttribute("True")]
        public bool TelemetryEnabled {
            get {
                return ((bool)(this["TelemetryEnabled"]));
            }
            set {
                this["TelemetryEnabled"] = value;
            }
        }
    }
}
