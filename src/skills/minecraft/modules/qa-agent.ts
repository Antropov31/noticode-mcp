export const minecraftQAAgent = {
  id: "minecraft-qa",
  purpose: "Verify Minecraft changes without direct server administration.",
  abilities: [
    "prepare_test_environment",
    "check_plugin_behavior",
    "collect_game_observations",
    "report_regressions",
  ],
};
