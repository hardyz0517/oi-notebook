import { createMockDiscoveryProviders } from "./mockDiscoveryProvider";
import type {
  DiscoveryProvider,
  DiscoveryProviderCapability,
  DiscoveryProviderRegistryEntry,
  DiscoverySelectionResult,
  SearchPolicyDecision,
} from "./types";

const hasCapability = (
  provider: DiscoveryProvider,
  capability: DiscoveryProviderCapability,
): boolean => provider.capabilities.includes(capability);

const desiredCapabilities = (policy: SearchPolicyDecision): DiscoveryProviderCapability[] => {
  if (!policy.needSearch || policy.mode === "no_search") return [];
  if (policy.mode === "explicit_url") return ["exact_url"];
  if (policy.mode === "docs_technical") return ["official_docs", "web_search"];
  if (policy.mode === "oi_algorithm") return ["oi_sources", "web_search"];
  if (policy.mode === "news_recent") return ["news_search", "web_search"];
  if (policy.mode === "rumor_check" || policy.risk === "high") return ["news_search", "web_search", "official_docs"];
  return ["web_search", "news_search", "official_docs"];
};

const selectionReason = (
  provider: DiscoveryProvider,
  desired: DiscoveryProviderCapability[],
): string => {
  const matched = desired.filter((capability) => hasCapability(provider, capability));
  if (!provider.enabled) return "provider_disabled";
  if (matched.length === 0) return "capability_not_needed";
  return `matched_${matched.join("_")}`;
};

export const createDefaultDiscoveryRegistry = (): DiscoveryProvider[] =>
  createMockDiscoveryProviders().sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));

export const getProviderCapabilities = (
  providers: DiscoveryProvider[] = createDefaultDiscoveryRegistry(),
): Record<string, DiscoveryProviderCapability[]> =>
  Object.fromEntries(providers.map((provider) => [provider.name, provider.capabilities]));

export const selectProvidersForPolicy = (
  policy: SearchPolicyDecision,
  providers: DiscoveryProvider[] = createDefaultDiscoveryRegistry(),
): DiscoverySelectionResult => {
  const desired = desiredCapabilities(policy);
  const entries: DiscoveryProviderRegistryEntry[] = providers.map((provider) => {
    const selected = provider.enabled && desired.some((capability) => hasCapability(provider, capability));
    return {
      provider,
      selected,
      reason: selectionReason(provider, desired),
    };
  });
  const selectedProviders = entries
    .filter((entry) => entry.selected)
    .map((entry) => entry.provider)
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
  return {
    entries,
    selectedProviders,
    diagnostics: {
      policyMode: policy.mode,
      vertical: policy.vertical,
      selectedProviderNames: selectedProviders.map((provider) => provider.name),
      skippedProviderNames: entries.filter((entry) => !entry.selected).map((entry) => entry.provider.name),
      reasons: Object.fromEntries(entries.map((entry) => [entry.provider.name, entry.reason])),
    },
  };
};
