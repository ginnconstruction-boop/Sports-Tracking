import { rosterColumnKeys, rosterEntryInputSchema, type RosterColumnKey } from "@/lib/contracts/admin";

export type RosterImportError = {
  row: number;
  field?: string;
  message: string;
};

export type ParsedRosterCsv = {
  headers: string[];
  columnMapping: Partial<Record<string, RosterColumnKey | "ignore">>;
  previewRows: Array<{
    row: number;
    cells: Record<string, string>;
  }>;
  players: Array<{
    firstName: string;
    lastName: string;
    preferredName?: string;
    jerseyNumber: string;
    grade?: string;
    position?: string;
    offenseRole: boolean;
    defenseRole: boolean;
    specialTeamsRole: boolean;
  }>;
  errors: RosterImportError[];
};

export type ParseRosterCsvOptions = {
  columnMapping?: Partial<Record<string, RosterColumnKey | "ignore">>;
};

const headerAliases: Record<string, string> = {
  firstname: "firstName",
  first_name: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  preferredname: "preferredName",
  preferred_name: "preferredName",
  jerseynumber: "jerseyNumber",
  jersey_number: "jerseyNumber",
  offense: "offenseRole",
  offense_role: "offenseRole",
  defense: "defenseRole",
  defense_role: "defenseRole",
  specialteams: "specialTeamsRole",
  special_teams: "specialTeamsRole",
  special_teams_role: "specialTeamsRole"
};

function normalizeHeader(value: string) {
  const compact = value.trim().replace(/\s+/g, "_");
  return headerAliases[compact.toLowerCase()] ?? compact;
}

function inferColumnMapping(headers: string[]) {
  return Object.fromEntries(
    headers.map((header) => {
      const normalized = normalizeHeader(header);
      const mapped = rosterColumnKeys.includes(normalized as RosterColumnKey)
        ? (normalized as RosterColumnKey)
        : "ignore";
      return [header, mapped];
    })
  ) as Partial<Record<string, RosterColumnKey | "ignore">>;
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "y";
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function mapRowToCanonical(
  row: Record<string, string>,
  mapping: Partial<Record<string, RosterColumnKey | "ignore">>
) {
  const canonical: Partial<Record<RosterColumnKey, string>> = {};

  for (const [header, value] of Object.entries(row)) {
    const target = mapping[header];
    if (!target || target === "ignore") continue;
    canonical[target] = value;
  }

  return canonical;
}

export function parseRosterCsv(csvText: string, options: ParseRosterCsvOptions = {}): ParsedRosterCsv {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      headers: [],
      columnMapping: {},
      previewRows: [],
      players: [],
      errors: [{ row: 1, message: "CSV file is empty." }]
    };
  }

  const headers = parseCsvLine(lines[0]);
  const inferredMapping = inferColumnMapping(headers);
  const columnMapping = {
    ...inferredMapping,
    ...(options.columnMapping ?? {})
  };
  const players: ParsedRosterCsv["players"] = [];
  const errors: RosterImportError[] = [];
  const previewRows: ParsedRosterCsv["previewRows"] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1;
    const cells = parseCsvLine(lines[index]);
    const rawRow = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const row = mapRowToCanonical(rawRow, columnMapping);

    previewRows.push({
      row: rowNumber,
      cells: rawRow
    });

    const parsed = rosterEntryInputSchema.safeParse({
      firstName: row.firstName,
      lastName: row.lastName,
      preferredName: row.preferredName || undefined,
      jerseyNumber: row.jerseyNumber,
      grade: row.grade || undefined,
      position: row.position || undefined,
      offenseRole: parseBoolean(row.offenseRole ?? ""),
      defenseRole: parseBoolean(row.defenseRole ?? ""),
      specialTeamsRole: parseBoolean(row.specialTeamsRole ?? "")
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          row: rowNumber,
          field: issue.path[0]?.toString(),
          message: issue.message
        });
      }
      continue;
    }

    players.push(parsed.data);
  }

  return {
    headers,
    columnMapping,
    previewRows,
    players,
    errors
  };
}
