export type TimesheetLaborInputRow = {
  employeeExternalId: string;
  projectExternalId: string;
  hours: number;
};

export type PayrollLaborInputRow = {
  employeeExternalId: string;
  grossWages: number;
};

export type LaborAllocationLine = {
  employeeExternalId: string;
  projectExternalId: string;
  hours: number;
  allocatedAmount: number;
};

export type LaborAllocationResult = {
  lines: LaborAllocationLine[];
  employeeCount: number;
  projectCount: number;
  totalHours: number;
  totalGrossWages: number;
  totalAllocatedAmount: number;
  employeesWithoutTimesheets: string[];
  employeesWithoutGrossWages: string[];
};

function round2(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function asFiniteNumber(input: unknown) {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;

  return Number.isFinite(value) ? value : 0;
}

function normalizeRow<T extends { employeeExternalId: string }>(row: T) {
  return {
    ...row,
    employeeExternalId: row.employeeExternalId.trim(),
  };
}

export function allocateLaborCostByTimesheets(input: {
  timesheets: TimesheetLaborInputRow[];
  grossWages: PayrollLaborInputRow[];
}): LaborAllocationResult {
  const timesheets = input.timesheets
    .map(normalizeRow)
    .filter((row) => row.employeeExternalId.length > 0 && row.projectExternalId.length > 0)
    .map((row) => ({
      ...row,
      hours: round2(asFiniteNumber(row.hours)),
    }))
    .filter((row) => row.hours > 0);

  const grossWages = input.grossWages
    .map(normalizeRow)
    .filter((row) => row.employeeExternalId.length > 0)
    .map((row) => ({
      ...row,
      grossWages: round2(asFiniteNumber(row.grossWages)),
    }))
    .filter((row) => row.grossWages > 0);

  const hoursByEmployeeProject = new Map<string, Map<string, number>>();
  const hoursByEmployee = new Map<string, number>();
  const wageByEmployee = new Map<string, number>();

  for (const row of timesheets) {
    const employeeProjects = hoursByEmployeeProject.get(row.employeeExternalId) ?? new Map();
    const projectHours = employeeProjects.get(row.projectExternalId) ?? 0;
    employeeProjects.set(row.projectExternalId, round2(projectHours + row.hours));
    hoursByEmployeeProject.set(row.employeeExternalId, employeeProjects);

    const currentHours = hoursByEmployee.get(row.employeeExternalId) ?? 0;
    hoursByEmployee.set(row.employeeExternalId, round2(currentHours + row.hours));
  }

  for (const row of grossWages) {
    const current = wageByEmployee.get(row.employeeExternalId) ?? 0;
    wageByEmployee.set(row.employeeExternalId, round2(current + row.grossWages));
  }

  const employeesWithoutTimesheets: string[] = [];
  const lines: LaborAllocationLine[] = [];

  for (const [employeeExternalId, employeeGrossWages] of wageByEmployee.entries()) {
    const totalHours = hoursByEmployee.get(employeeExternalId) ?? 0;
    const projectHoursMap = hoursByEmployeeProject.get(employeeExternalId);

    if (!projectHoursMap || totalHours <= 0) {
      employeesWithoutTimesheets.push(employeeExternalId);
      continue;
    }

    const entries = Array.from(projectHoursMap.entries()).map(([projectExternalId, hours]) => ({
      projectExternalId,
      hours,
    }));
    const rawLines = entries.map((entry) => {
      const ratio = entry.hours / totalHours;
      return {
        ...entry,
        rawAmount: employeeGrossWages * ratio,
        allocatedAmount: round2(employeeGrossWages * ratio),
      };
    });

    const roundedSum = rawLines.reduce((sum, row) => sum + row.allocatedAmount, 0);
    const roundingDiff = round2(employeeGrossWages - roundedSum);

    if (Math.abs(roundingDiff) > 0 && rawLines.length) {
      let largestIndex = 0;
      for (let index = 1; index < rawLines.length; index += 1) {
        if (rawLines[index].hours > rawLines[largestIndex].hours) {
          largestIndex = index;
        }
      }

      rawLines[largestIndex].allocatedAmount = round2(
        rawLines[largestIndex].allocatedAmount + roundingDiff,
      );
    }

    for (const row of rawLines) {
      lines.push({
        employeeExternalId,
        projectExternalId: row.projectExternalId,
        hours: row.hours,
        allocatedAmount: row.allocatedAmount,
      });
    }
  }

  const employeesWithoutGrossWages = Array.from(hoursByEmployee.keys()).filter(
    (employeeExternalId) => !wageByEmployee.has(employeeExternalId),
  );

  const totalHours = round2(timesheets.reduce((sum, row) => sum + row.hours, 0));
  const totalGrossWages = round2(grossWages.reduce((sum, row) => sum + row.grossWages, 0));
  const totalAllocatedAmount = round2(lines.reduce((sum, row) => sum + row.allocatedAmount, 0));
  const projectCount = new Set(lines.map((row) => row.projectExternalId)).size;

  return {
    lines,
    employeeCount: wageByEmployee.size,
    projectCount,
    totalHours,
    totalGrossWages,
    totalAllocatedAmount,
    employeesWithoutTimesheets,
    employeesWithoutGrossWages,
  };
}
