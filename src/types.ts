export interface AcademicClass {
  id: string | number;
  label: string;
}

export interface AcademicDiscipline {
  id: string | number;
  label: string;
}

export interface ExamPaper {
  id: number | string;
  nom_epreuve: string;
  titre?: string;
  libelle?: string;
  classe?: string | { id: number; libelle: string };
  discipline?: string | { id: number; libelle: string };
  annee?: string | number;
  session?: string;
  created_at?: string;
  [key: string]: any; // fallback for alternative keys
}

export interface DownloadItem {
  paper: ExamPaper;
  status: "idle" | "downloading" | "success" | "error";
  progress: number; // 0 to 100
  speed?: string; // e.g. "1.2 MB/s"
  error?: string;
}
