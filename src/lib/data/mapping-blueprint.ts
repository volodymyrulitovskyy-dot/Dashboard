export type MappingStatus = "TBD" | "IN_PROGRESS" | "READY";

export type NetsuiteReferenceMapping = {
  id: string;
  label: string;
  netsuiteRecordType: string;
  netsuiteKeyField: string;
  netsuiteDisplayField: string;
  externalTableName: string;
  externalPrimaryKey: string;
  externalDisplayField: string;
  status: MappingStatus;
  notes: string;
};

export type ExternalReferenceTable = {
  tableName: string;
  purpose: string;
  requiredColumns: string[];
};

export const netsuiteReferenceMappings: NetsuiteReferenceMapping[] = [
  {
    id: "netsuite-coa",
    label: "NetSuite COA",
    netsuiteRecordType: "account",
    netsuiteKeyField: "internalId",
    netsuiteDisplayField: "accountnumber + acctname",
    externalTableName: "ExternalCoaTbd",
    externalPrimaryKey: "externalAccountId",
    externalDisplayField: "accountCode + accountName",
    status: "TBD",
    notes: "Use this mapping for GL posting and reconciliation account rollups.",
  },
  {
    id: "netsuite-projects",
    label: "Project List",
    netsuiteRecordType: "job",
    netsuiteKeyField: "internalId",
    netsuiteDisplayField: "entityid + companyname",
    externalTableName: "ExternalProjectTbd",
    externalPrimaryKey: "externalProjectId",
    externalDisplayField: "projectCode + projectName",
    status: "TBD",
    notes: "Used by labor allocation and project-based revenue/cost matching.",
  },
  {
    id: "netsuite-vendors",
    label: "Vendor List",
    netsuiteRecordType: "vendor",
    netsuiteKeyField: "internalId",
    netsuiteDisplayField: "entityid + companyname",
    externalTableName: "ExternalVendorTbd",
    externalPrimaryKey: "externalVendorId",
    externalDisplayField: "vendorCode + vendorName",
    status: "TBD",
    notes: "Used for AP bill reconciliation between Ramp and NetSuite.",
  },
  {
    id: "netsuite-employees",
    label: "Employee List",
    netsuiteRecordType: "employee",
    netsuiteKeyField: "internalId",
    netsuiteDisplayField: "entityid + email",
    externalTableName: "ExternalEmployeeTbd",
    externalPrimaryKey: "externalEmployeeId",
    externalDisplayField: "employeeCode + displayName",
    status: "TBD",
    notes: "Required for ADP gross wages and Unanet timesheet labor distributions.",
  },
  {
    id: "netsuite-customers",
    label: "Customer List",
    netsuiteRecordType: "customer",
    netsuiteKeyField: "internalId",
    netsuiteDisplayField: "entityid + companyname",
    externalTableName: "ExternalCustomerTbd",
    externalPrimaryKey: "externalCustomerId",
    externalDisplayField: "customerCode + customerName",
    status: "TBD",
    notes: "Supports project/customer rollups and AR reconciliation alignment.",
  },
];

export const externalReferenceTables: ExternalReferenceTable[] = [
  {
    tableName: "ExternalCoaTbd",
    purpose: "External chart of accounts cross-reference",
    requiredColumns: [
      "externalAccountId",
      "accountCode",
      "accountName",
      "accountType",
      "isActive",
      "metadata",
    ],
  },
  {
    tableName: "ExternalProjectTbd",
    purpose: "External project master cross-reference",
    requiredColumns: [
      "externalProjectId",
      "projectCode",
      "projectName",
      "customerExternalId",
      "isActive",
      "metadata",
    ],
  },
  {
    tableName: "ExternalVendorTbd",
    purpose: "External vendor master cross-reference",
    requiredColumns: [
      "externalVendorId",
      "vendorCode",
      "vendorName",
      "taxIdentifier",
      "isActive",
      "metadata",
    ],
  },
  {
    tableName: "ExternalEmployeeTbd",
    purpose: "External employee master cross-reference",
    requiredColumns: [
      "externalEmployeeId",
      "employeeCode",
      "displayName",
      "workEmail",
      "isActive",
      "metadata",
    ],
  },
  {
    tableName: "ExternalCustomerTbd",
    purpose: "External customer master cross-reference",
    requiredColumns: [
      "externalCustomerId",
      "customerCode",
      "customerName",
      "parentExternalCustomerId",
      "isActive",
      "metadata",
    ],
  },
];
