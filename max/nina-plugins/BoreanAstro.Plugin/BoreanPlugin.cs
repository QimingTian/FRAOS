using NINA.Core.Utility;
using NINA.Plugin;
using NINA.Plugin.Interfaces;
using NINA.Equipment.Interfaces.Mediator;
using BoreanAstro.Plugin.Properties;
using System;
using System.ComponentModel;
using System.ComponentModel.Composition;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Settings = BoreanAstro.Plugin.Properties.Settings;

namespace BoreanAstro.Plugin {

    [Export(typeof(IPluginManifest))]
    public class BoreanPlugin : PluginBase, INotifyPropertyChanged {

        private readonly MountPointingPublisher _publisher;

        [ImportingConstructor]
        public BoreanPlugin(ITelescopeMediator telescopeMediator) {

            if (Settings.Default.UpdateSettings) {
                Settings.Default.Upgrade();
                Settings.Default.UpdateSettings = false;
                CoreUtil.SaveSettings(Settings.Default);
            }

            ApplyTenantLicenseIfNeeded();

            _publisher = new MountPointingPublisher(telescopeMediator);
        }

        public override Task Teardown() {
            _publisher.Dispose();
            return base.Teardown();
        }

        /// <summary>
        /// Auto-fill hub URL and Bearer secret from %LOCALAPPDATA%\BoreanAstro\tenant.json when empty or stale.
        /// </summary>
        public void ApplyTenantLicenseIfNeeded() {
            if (!TenantConfigLoader.TryLoad(out var license)) return;

            var endpoint = license.MountPointingUrl;
            var secret = license.ApiSecret;

            var currentEndpoint = (Settings.Default.ApiEndpoint ?? string.Empty).Trim();
            var currentSecret = (Settings.Default.SharedSecret ?? string.Empty).Trim();

            var changed = false;
            if (currentEndpoint.Length == 0 || currentEndpoint != endpoint) {
                Settings.Default.ApiEndpoint = endpoint;
                changed = true;
            }
            if (currentSecret.Length == 0 || currentSecret != secret) {
                Settings.Default.SharedSecret = secret;
                changed = true;
            }
            if (changed) {
                CoreUtil.SaveSettings(Settings.Default);
                RaisePropertyChanged(nameof(ApiEndpoint));
                RaisePropertyChanged(nameof(SharedSecret));
            }
        }

        public string ApiEndpoint {
            get => Settings.Default.ApiEndpoint ?? string.Empty;
            set {
                Settings.Default.ApiEndpoint = value ?? string.Empty;
                CoreUtil.SaveSettings(Settings.Default);
                RaisePropertyChanged();
            }
        }

        public int PostIntervalMilliseconds {
            get => Settings.Default.PostIntervalMilliseconds;
            set {
                Settings.Default.PostIntervalMilliseconds = Math.Max(250, value);
                CoreUtil.SaveSettings(Settings.Default);
                RaisePropertyChanged();
            }
        }

        public string SharedSecret {
            get => Settings.Default.SharedSecret ?? string.Empty;
            set {
                Settings.Default.SharedSecret = value ?? string.Empty;
                CoreUtil.SaveSettings(Settings.Default);
                RaisePropertyChanged();
            }
        }

        public string StationId {
            get => Settings.Default.StationId ?? string.Empty;
            set {
                Settings.Default.StationId = value ?? string.Empty;
                CoreUtil.SaveSettings(Settings.Default);
                RaisePropertyChanged();
            }
        }

        public bool TelemetryEnabled {
            get => Settings.Default.TelemetryEnabled;
            set {
                Settings.Default.TelemetryEnabled = value;
                CoreUtil.SaveSettings(Settings.Default);
                RaisePropertyChanged();
            }
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected void RaisePropertyChanged([CallerMemberName] string? propertyName = null) {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
