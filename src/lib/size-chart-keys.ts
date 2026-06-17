// Derive a stable column key from a label. MUST be identical on client and server.
export function toColumnKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Build disambiguated {key,label} columns from raw labels.
export function buildColumns(labels: string[]): { key: string; label: string }[] {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    for (const raw of labels) {
        const label = raw.trim();
        if (!label) continue;
        let key = toColumnKey(label);
        if (!key) continue;
        let unique = key;
        let n = 2;
        while (seen.has(unique)) unique = `${key}_${n++}`;
        seen.add(unique);
        out.push({ key: unique, label });
    }
    return out;
}