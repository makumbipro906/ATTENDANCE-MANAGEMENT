export type StudentStatus = "Active" | "Archived";

export type ParentGuardianContact = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
};

export type StudentRecord = {
  id: string;
  admissionNumber: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  academicYear: string;
  term: string;
  className: string;
  stream: string;
  section: string;
  guardianName: string;
  relationship: string;
  primaryPhone: string;
  studentPhone: string;
  guardianEmail: string;
  additionalGuardians?: ParentGuardianContact[];
  status: StudentStatus;
  biometricsStatus: "Pending" | "Complete";
  biometricsCapturedAt?: string;
};
