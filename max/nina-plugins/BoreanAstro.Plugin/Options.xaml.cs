using System.ComponentModel.Composition;
using System.Windows;
using System.Windows.Controls;

namespace BoreanAstro.Plugin {

    [Export(typeof(ResourceDictionary))]
    partial class Options : ResourceDictionary {

        public Options() {
            InitializeComponent();
        }

        private void OnReloadLicenseClick(object sender, RoutedEventArgs e) {
            if (sender is not Button button) return;
            if (button.DataContext is not BoreanPlugin plugin) return;
            plugin.ApplyTenantLicenseIfNeeded();
        }
    }
}
