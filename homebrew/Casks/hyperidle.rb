cask "hyperidle" do
  version "0.0.1"

  if Hardware::CPU.arm?
    url "https://github.com/ambrovia/hyperidle-releases/releases/download/v#{version}/HyperIdle-#{version}-arm64.dmg"
    sha256 "PLACEHOLDER_ARM64_SHA256"
  else
    url "https://github.com/ambrovia/hyperidle-releases/releases/download/v#{version}/HyperIdle-#{version}-x64.dmg"
    sha256 "PLACEHOLDER_X64_SHA256"
  end

  name "HyperIdle"
  desc "Agentic operating system for AI product teams"
  homepage "https://hyperidle.com"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "HyperIdle.app"

  # brew uninstall --cask hyperidle removes the app but NOT ~/Library/Application
  # Support/HyperIdle. This preserves the user's database (hyperidle.db) across
  # reinstalls. @lore N5: No uninstall block = userData is preserved by default.
  # The zap clause below handles full purge when the user explicitly requests it.

  zap trash: [
    "~/Library/Application Support/HyperIdle",
    "~/Library/Logs/HyperIdle",
    "~/Library/Preferences/com.hyperidle.app.plist",
    "~/Library/Saved Application State/com.hyperidle.app.savedState",
  ]
end
