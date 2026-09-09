export interface AgentPlugin {
  id: string;
  name: string;
  initialize?: () => void | Promise<void>;
}

export class PluginLoader {
  private plugins: AgentPlugin[] = [];

  register(plugin: AgentPlugin) {
    this.plugins.push(plugin);
  }

  list() {
    return this.plugins;
  }

  async initialize() {
    for (const plugin of this.plugins) {
      await plugin.initialize?.();
    }
  }
}
