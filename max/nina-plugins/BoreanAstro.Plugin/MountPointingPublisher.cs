using NINA.Core.Utility;
using NINA.Equipment.Equipment.MyTelescope;
using NINA.Equipment.Interfaces.Mediator;
using BoreanAstro.Plugin.Properties;
using System;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace BoreanAstro.Plugin {

    /// <summary>
    /// Subscribes to telescope mediator updates and POSTs JSON to the configured hub API on an interval.
    /// </summary>
    public sealed class MountPointingPublisher : ITelescopeConsumer {
        private static readonly HttpClient Http = CreateHttpClient();

        private readonly ITelescopeMediator _telescopeMediator;
        private readonly object _postSync = new object();
        private DateTime _lastPostUtc = DateTime.MinValue;
        private volatile bool _disposed;

        private static HttpClient CreateHttpClient() {
            var c = new HttpClient {
                Timeout = TimeSpan.FromSeconds(15),
            };
            c.DefaultRequestHeaders.TryAddWithoutValidation(
                "User-Agent",
                "Borean Astro NINA Plugin/1.0 (Windows)");
            c.DefaultRequestHeaders.TryAddWithoutValidation("X-Borean-Client", "nina-plugin");
            return c;
        }

        public MountPointingPublisher(ITelescopeMediator telescopeMediator) {
            _telescopeMediator = telescopeMediator ?? throw new ArgumentNullException(nameof(telescopeMediator));
            _telescopeMediator.RegisterConsumer(this);
        }

        public void UpdateDeviceInfo(TelescopeInfo deviceInfo) {
            if (_disposed || deviceInfo == null) return;
            if (!Settings.Default.TelemetryEnabled) return;

            var url = (Settings.Default.ApiEndpoint ?? string.Empty).Trim();
            var secret = (Settings.Default.SharedSecret ?? string.Empty).Trim();
            if (url.Length == 0 || secret.Length == 0) {
                if (TenantConfigLoader.TryLoad(out var license)) {
                    Settings.Default.ApiEndpoint = license.MountPointingUrl;
                    Settings.Default.SharedSecret = license.ApiSecret;
                    CoreUtil.SaveSettings(Settings.Default);
                    url = license.MountPointingUrl;
                    secret = license.ApiSecret;
                }
            }
            if (url.Length == 0) return;

            var interval = Math.Max(250, Settings.Default.PostIntervalMilliseconds);
            var now = DateTime.UtcNow;
            lock (_postSync) {
                if ((now - _lastPostUtc).TotalMilliseconds < interval) return;
                _lastPostUtc = now;
            }

            _ = PostAsync(deviceInfo, url);
        }

        private async Task PostAsync(TelescopeInfo info, string url) {
            try {
                var payload = BuildPayload(info);
                var json = JsonSerializer.Serialize(payload, SerializerOptions);
                using var req = new HttpRequestMessage(HttpMethod.Post, url) {
                    Content = new StringContent(json, Encoding.UTF8, "application/json"),
                };
                var secret = Settings.Default.SharedSecret?.Trim() ?? string.Empty;
                if (secret.Length > 0) {
                    req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + secret);
                    req.Headers.TryAddWithoutValidation("x-nina-mount-telemetry-secret", secret);
                }

                using var resp = await Http.SendAsync(req).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) {
                    Logger.Warning($"Borean mount pointing POST failed: {(int)resp.StatusCode} {resp.ReasonPhrase}");
                }
            } catch (Exception ex) {
                Logger.Error(ex);
            }
        }

        private static readonly JsonSerializerOptions SerializerOptions = new JsonSerializerOptions {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        private static TelemetryDto BuildPayload(TelescopeInfo info) {
            var v = Assembly.GetExecutingAssembly().GetName().Version;
            var versionStr = v == null ? null : $"{v.Major}.{v.Minor}.{v.Build}";

            var station = Settings.Default.StationId?.Trim() ?? string.Empty;

            return new TelemetryDto {
                Source = "borean-nina-plugin",
                PluginVersion = versionStr,
                StationId = station.Length > 0 ? station : null,
                Connected = info.Connected,
                RaHours = Fin(info.RightAscension),
                DecDeg = Fin(info.Declination),
                SiderealTimeHours = Fin(info.SiderealTime),
                SiteLatitudeDeg = Fin(info.SiteLatitude),
                AltitudeDeg = Fin(info.Altitude),
                AzimuthDeg = Fin(info.Azimuth),
                Slewing = info.Slewing,
                AtPark = info.AtPark,
                TrackingEnabled = info.TrackingEnabled,
                SideOfPier = info.SideOfPier.ToString(),
                Epoch = info.EquatorialSystem.ToString(),
                ClientUtc = DateTime.UtcNow.ToString("o"),
            };
        }

        private static double? Fin(double value) {
            if (double.IsNaN(value) || double.IsInfinity(value)) return null;
            return value;
        }

        private sealed class TelemetryDto {
            public string? Source { get; set; }
            public string? PluginVersion { get; set; }
            public string? StationId { get; set; }
            public bool Connected { get; set; }
            public double? RaHours { get; set; }
            public double? DecDeg { get; set; }
            public double? SiderealTimeHours { get; set; }
            public double? SiteLatitudeDeg { get; set; }
            public double? AltitudeDeg { get; set; }
            public double? AzimuthDeg { get; set; }
            public bool Slewing { get; set; }
            public bool AtPark { get; set; }
            public bool TrackingEnabled { get; set; }
            public string? SideOfPier { get; set; }
            public string? Epoch { get; set; }
            public string? ClientUtc { get; set; }
        }

        public void Dispose() {
            if (_disposed) return;
            _disposed = true;
            try {
                _telescopeMediator.RemoveConsumer(this);
            } catch (Exception ex) {
                Logger.Error(ex);
            }
        }
    }
}
