export interface AgentConnector {
  id: string;
  name: string;
  capabilities: string[];
  available(): Promise<boolean>;
}
