using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BoreanAstro.Plugin {

    internal sealed class TenantLicenseFile {
        [JsonPropertyName("tenantId")]
        public string? TenantId { get; set; }

        [JsonPropertyName("apiBaseUrl")]
        public string? ApiBaseUrl { get; set; }

        [JsonPropertyName("apiSecret")]
        public string? ApiSecret { get; set; }
    }

    internal sealed class TenantLicenseConfig {
        public string TenantId { get; init; } = string.Empty;
        public string ApiBaseUrl { get; init; } = string.Empty;
        public string ApiSecret { get; init; } = string.Empty;

        public string MountPointingUrl =>
            $"{ApiBaseUrl.TrimEnd('/')}/api/personal/{Uri.EscapeDataString(TenantId)}/imaging/mount-pointing";
    }

    /// <summary>
    /// Reads %LOCALAPPDATA%\BoreanAstro\tenant.json (same file Station/Control use after license activation).
    /// </summary>
    internal static class TenantConfigLoader {
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions {
            PropertyNameCaseInsensitive = true,
        };

        public static bool TryLoad(out TenantLicenseConfig config) {
            config = new TenantLicenseConfig();
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BoreanAstro",
                "tenant.json");

            if (!File.Exists(path)) return false;

            try {
                var raw = File.ReadAllText(path);
                var file = JsonSerializer.Deserialize<TenantLicenseFile>(raw, JsonOptions);
                if (file == null) return false;

                var tenantId = (file.TenantId ?? string.Empty).Trim();
                var apiBaseUrl = (file.ApiBaseUrl ?? string.Empty).Trim().TrimEnd('/');
                var apiSecret = (file.ApiSecret ?? string.Empty).Trim();

                if (tenantId.Length == 0 || apiBaseUrl.Length == 0 || apiSecret.Length == 0) {
                    return false;
                }

                config = new TenantLicenseConfig {
                    TenantId = tenantId,
                    ApiBaseUrl = apiBaseUrl,
                    ApiSecret = apiSecret,
                };
                return true;
            } catch {
                return false;
            }
        }
    }
}
