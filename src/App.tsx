import { useState, useEffect, useMemo } from "react";
import JSZip from "jszip";
import { 
  Download, 
  Search, 
  FolderDown, 
  FileText, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  ListFilter, 
  Sliders, 
  X,
  ChevronDown,
  ChevronRight,
  Info,
  Layers,
  Check,
  AlertCircle,
  Folder,
  FolderOpen,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CLASSES_PRESETS, DISCIPLINES_PRESETS } from "./constants";
import { ExamPaper, DownloadItem } from "./types";

export default function App() {
  // Filters State (persisted locally)
  const [selectedClassId, setSelectedClassId] = useState<string>(() => localStorage.getItem("hilarus_class_id") || "25");
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string>(() => localStorage.getItem("hilarus_discipline_id") || "6");
  const [limit, setLimit] = useState<number>(() => Number(localStorage.getItem("hilarus_limit") || "300"));
  const [searchQuery, setSearchQuery] = useState<string>(() => localStorage.getItem("hilarus_search_query") || "");

  // Custom ID Toggles (in case user wants to specify custom values directly)
  const [useCustomClassId, setUseCustomClassId] = useState<boolean>(() => localStorage.getItem("hilarus_use_custom_class") === "true");
  const [customClassId, setCustomClassId] = useState<string>(() => localStorage.getItem("hilarus_custom_class_id") || "");
  const [useCustomDisciplineId, setUseCustomDisciplineId] = useState<boolean>(() => localStorage.getItem("hilarus_use_custom_discipline") === "true");
  const [customDisciplineId, setCustomDisciplineId] = useState<string>(() => localStorage.getItem("hilarus_custom_discipline_id") || "");

  // Data State
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchProgressStep, setSearchProgressStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Local Search & Selection State
  const [localFilterText, setLocalFilterText] = useState<string>(() => localStorage.getItem("hilarus_local_filter") || "");
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string | number>>(new Set());

  // Folding/Collapse State
  const [groupingMode, setGroupingMode] = useState<"annee" | "discipline" | "simple">(() => (localStorage.getItem("hilarus_grouping_mode") as any) || "annee");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Download settings
  const [concurrency, setConcurrency] = useState<number>(() => Number(localStorage.getItem("hilarus_concurrency") || "10"));
  const [zipFileName, setZipFileName] = useState<string>(() => localStorage.getItem("hilarus_zip_filename") || "archive_epreuves.zip");

  // Downloader Run State
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadStep, setDownloadStep] = useState<"fetching" | "packaging" | "completed">("fetching");
  const [downloadQueueProgress, setDownloadQueueProgress] = useState<DownloadItem[]>([]);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // LocalStorage Persist Effects
  useEffect(() => {
    localStorage.setItem("hilarus_class_id", selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    localStorage.setItem("hilarus_discipline_id", selectedDisciplineId);
  }, [selectedDisciplineId]);

  useEffect(() => {
    localStorage.setItem("hilarus_limit", String(limit));
  }, [limit]);

  useEffect(() => {
    localStorage.setItem("hilarus_search_query", searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem("hilarus_use_custom_class", String(useCustomClassId));
  }, [useCustomClassId]);

  useEffect(() => {
    localStorage.setItem("hilarus_custom_class_id", customClassId);
  }, [customClassId]);

  useEffect(() => {
    localStorage.setItem("hilarus_use_custom_discipline", String(useCustomDisciplineId));
  }, [useCustomDisciplineId]);

  useEffect(() => {
    localStorage.setItem("hilarus_custom_discipline_id", customDisciplineId);
  }, [customDisciplineId]);

  useEffect(() => {
    localStorage.setItem("hilarus_local_filter", localFilterText);
  }, [localFilterText]);

  useEffect(() => {
    localStorage.setItem("hilarus_grouping_mode", groupingMode);
  }, [groupingMode]);

  useEffect(() => {
    localStorage.setItem("hilarus_concurrency", String(concurrency));
  }, [concurrency]);

  useEffect(() => {
    localStorage.setItem("hilarus_zip_filename", zipFileName);
  }, [zipFileName]);

  // Auto-scroll when downloading is clicked or starts, to bring the progress panel to visible viewport
  useEffect(() => {
    if (downloading) {
      setTimeout(() => {
        const panel = document.getElementById("progress-panel");
        if (panel) {
          panel.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
    }
  }, [downloading]);

  // Fetch initial results on mount
  useEffect(() => {
    handleSearch();
  }, []);

  // Compute final IDs used for query
  const rawClassId = useCustomClassId ? customClassId : selectedClassId;
  const rawDisciplineId = useCustomDisciplineId ? customDisciplineId : selectedDisciplineId;

  // Search execution
  const handleSearch = async () => {
    setLoading(true);
    setSearchProgressStep("Connexion à l'index sécurisé de la base de données...");
    setError(null);
    setSelectedPaperIds(new Set()); // Clear selection
    
    try {
      const params = new URLSearchParams();
      if (rawClassId) params.append("classe_id", rawClassId);
      if (rawDisciplineId) params.append("discipline_id", rawDisciplineId);
      if (limit) params.append("limit", String(limit));
      if (searchQuery) params.append("search", searchQuery);

      setSearchProgressStep("Requête envoyée, traitement des filtres d'épreuves...");
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Erreur de communication: code ${response.status}`);
      }

      setSearchProgressStep("Lecture et conversion des informations d'épreuves...");
      const data = await response.json();
      
      const rawResults: any[] = Array.isArray(data) 
        ? data 
        : Array.isArray(data.data) 
          ? data.data 
          : Array.isArray(data.results)
            ? data.results
            : [];

      const enrichedResults: ExamPaper[] = rawResults.map((paper: any) => {
        // Extract year
        const annee = paper.Year?.year || (paper.date_epreuve ? new Date(paper.date_epreuve).getFullYear() : "") || "Session Générale";
        
        // Extract discipline
        const disciplineIdStr = String(paper.discipline_id || "");
        const matchedDiscipline = DISCIPLINES_PRESETS.find(d => String(d.id) === disciplineIdStr);
        const discipline_libelle = paper.Discipline?.acronym || matchedDiscipline?.label || "Discipline";
        
        // Extract class
        let classe_libelle = "";
        if (paper.BanqueEpreuveClasse && paper.BanqueEpreuveClasse.length > 0) {
          const cls = paper.BanqueEpreuveClasse[0]?.Classe;
          if (cls) {
            classe_libelle = cls.Promotion?.acronym || cls.Promotion?.name || "";
            if (cls.Series?.acronym || cls.Series?.name) {
              classe_libelle += " " + (cls.Series?.acronym || cls.Series?.name);
            }
          }
        }
        if (!classe_libelle) {
          const classIdFromRelation = paper.BanqueEpreuveClasse?.[0]?.classe_id;
          const classIdToMatch = String(classIdFromRelation || rawClassId);
          const matchedClass = CLASSES_PRESETS.find(c => String(c.id) === classIdToMatch);
          classe_libelle = matchedClass?.label || `Classe ${classIdToMatch}`;
        }
        
        // Extract type epreuve
        const typeEpreuve = paper.TypeEpreuve?.name || paper.TypeEpreuve?.acronym || "Épreuve";
        
        // Extract school
        const schoolName = paper.School?.acronym || paper.School?.name || "";
        
        // Build clean title
        const titleParts = [];
        if (typeEpreuve) titleParts.push(typeEpreuve);
        if (discipline_libelle) titleParts.push(discipline_libelle);
        if (schoolName) titleParts.push(`- ${schoolName}`);
        if (annee && annee !== "Session Générale") titleParts.push(`(${annee})`);
        
        const generatedTitle = titleParts.join(" ") || paper.nom_epreuve || "Épreuve sans titre";
        
        return {
          ...paper,
          id: paper.id,
          nom_epreuve: paper.nom_epreuve,
          titre: generatedTitle,
          libelle: generatedTitle,
          annee: annee,
          discipline_libelle: discipline_libelle,
          classe_libelle: classe_libelle,
        };
      });
            
      setPapers(enrichedResults);
      
      // Automatically select all items upon search to simplify downloads
      const allIds = enrichedResults.map(p => p.id || p.nom_epreuve);
      setSelectedPaperIds(new Set(allIds));

      // Dynamic default ZIP file name based on class and subject chosen
      const classLabel = CLASSES_PRESETS.find(c => c.id === rawClassId)?.label || `Classe_${rawClassId}`;
      const disciplineLabel = DISCIPLINES_PRESETS.find(d => d.id === rawDisciplineId)?.label || `Discipline_${rawDisciplineId}`;
      const cleanClassName = classLabel.replace(/[\s()]/g, "_").replace(/_+/g, "_");
      const cleanDisciplineName = disciplineLabel.split(" ")[0].replace(/[\s()]/g, "_");
      setZipFileName(`Banque_${cleanClassName}_${cleanDisciplineName}.zip`);

      setSearchProgressStep("Finalisation de l'affichage interactif...");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Une erreur s'est produite lors de l'interrogation de la base d'épreuves");
    } finally {
      setLoading(false);
      setSearchProgressStep("");
    }
  };

  // Local filtering of table results
  const filteredPapers = useMemo(() => {
    if (!localFilterText) return papers;
    const lowerText = localFilterText.toLowerCase();
    return papers.filter(p => {
      const title = (p.titre || p.libelle || p.nom_epreuve || "").toLowerCase();
      const year = String(p.annee || "").toLowerCase();
      const code = String(p.code || "").toLowerCase();
      return title.includes(lowerText) || year.includes(lowerText) || code.includes(lowerText);
    });
  }, [papers, localFilterText]);

  // Collapsible toggle helpers
  const toggleGroupCollapse = (groupName: string) => {
    const updated = new Set(collapsedGroups);
    if (updated.has(groupName)) {
      updated.delete(groupName);
    } else {
      updated.add(groupName);
    }
    setCollapsedGroups(updated);
  };

  // Grouped results calculations
  const groupedPapers = useMemo((): Record<string, ExamPaper[]> => {
    if (groupingMode === "simple") return { "Toutes les épreuves": filteredPapers };

    const groups: Record<string, ExamPaper[]> = {};
    filteredPapers.forEach(paper => {
      let groupKey = "Non spécifié";
      if (groupingMode === "annee") {
        groupKey = paper.annee ? `Session ${paper.annee}` : "Sessions Générales";
      } else if (groupingMode === "discipline") {
        const paperDisciplineRaw = paper.discipline_libelle || (typeof paper.discipline === 'object' ? paper.discipline?.libelle : paper.discipline);
        groupKey = paperDisciplineRaw || "Autre Matière";
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(paper);
    });

    return groups;
  }, [filteredPapers, groupingMode]);

  // Handle single item select
  const toggleSelectPaper = (id: string | number) => {
    const updated = new Set(selectedPaperIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedPaperIds(updated);
  };

  // Check if everything in a group is checked
  const isGroupAllSelected = (groupItems: ExamPaper[]) => {
    return groupItems.every(p => selectedPaperIds.has(p.id || p.nom_epreuve));
  };

  // Select/Deselect whole group
  const toggleGroupSelection = (groupItems: ExamPaper[]) => {
    const updated = new Set(selectedPaperIds);
    const allSelected = isGroupAllSelected(groupItems);

    groupItems.forEach(p => {
      const pId = p.id || p.nom_epreuve;
      if (allSelected) {
        updated.delete(pId);
      } else {
        updated.add(pId);
      }
    });
    setSelectedPaperIds(updated);
  };

  // Toggle select all on currently filtered results
  const toggleAllFiltered = () => {
    const updated = new Set(selectedPaperIds);
    const filteredIds = filteredPapers.map(p => p.id || p.nom_epreuve);
    const allAreSelected = filteredIds.every(id => updated.has(id));

    if (allAreSelected) {
      filteredIds.forEach(id => updated.delete(id));
    } else {
      filteredIds.forEach(id => updated.add(id));
    }
    setSelectedPaperIds(updated);
  };

  // Cancel download process
  const handleCancelDownloads = () => {
    if (abortController) {
      abortController.abort();
    }
    setDownloading(false);
    setZipProgress(null);
  };

  // Trigger batch download
  const handleBatchDownload = async () => {
    if (selectedPaperIds.size === 0) return;
    
    // Create new abort controller
    const controller = new AbortController();
    setAbortController(controller);
    setDownloading(true);
    setDownloadStep("fetching");
    setZipProgress(null);

    // Filter list of papers selected by the user
    const selectedList = papers.filter(p => selectedPaperIds.has(p.id || p.nom_epreuve));

    // Initialize state tracker for the queue
    const queueState: DownloadItem[] = selectedList.map(paper => ({
      paper,
      status: "idle",
      progress: 0
    }));
    setDownloadQueueProgress(queueState);

    const zip = new JSZip();
    let currentTaskIndex = 0;

    // Async worker model with parallel execution
    const runWorker = async () => {
      while (currentTaskIndex < selectedList.length && !controller.signal.aborted) {
        const index = currentTaskIndex;
        currentTaskIndex++;
        if (index >= selectedList.length) break;

        const paper = selectedList[index];

        // Mark as Downloading in state
        setDownloadQueueProgress(prev => prev.map((item, idx) => 
          idx === index ? { ...item, status: "downloading", progress: 5 } : item
        ));

        try {
          const startTime = Date.now();
          const response = await fetch(`/api/file?id=${encodeURIComponent(paper.nom_epreuve)}`, {
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`HTTP Erreur ${response.status}`);
          }

          const reader = response.body?.getReader();
          const contentLength = +(response.headers.get("Content-Length") || "0");
          const chunks: Uint8Array[] = [];
          let receivedLength = 0;

          if (reader) {
            while (true) {
              if (controller.signal.aborted) {
                throw new Error("Annulé");
              }
              const { done, value } = await reader.read();
              if (done) break;

              chunks.push(value);
              receivedLength += value.length;

              const percent = contentLength ? Math.round((receivedLength / contentLength) * 100) : 50;
              const duration = (Date.now() - startTime) / 1000;
              const kbps = duration > 0 ? (receivedLength / 1024 / duration) : 0;
              const speedString = kbps > 1024 
                ? `${(kbps / 1024).toFixed(1)} MB/s` 
                : `${kbps.toFixed(0)} KB/s`;

              setDownloadQueueProgress(prev => prev.map((item, idx) => 
                idx === index ? { 
                  ...item, 
                  progress: Math.min(percent, 98), 
                  speed: speedString 
                } : item
              ));
            }
          } else {
            const blob = await response.blob();
            chunks.push(new Uint8Array(await blob.arrayBuffer()));
          }

          const fileData = new Blob(chunks);
          
          // Determine the file extension dynamically from response headers
          const contentDisposition = response.headers.get("Content-Disposition");
          const contentType = response.headers.get("Content-Type");
          
          let fileExtension = "pdf"; // Default to pdf since EducMaster is typically PDF
          if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/i);
            if (match && match[1].includes(".")) {
              fileExtension = match[1].split(".").pop() || "pdf";
            }
          } else if (contentType) {
            if (contentType === "application/pdf") {
              fileExtension = "pdf";
            } else if (contentType.includes("word") || contentType.includes("officedocument") || contentType.includes("msword")) {
              fileExtension = "docx";
            }
          }

          // Formulate safe, completely unique file name per paper
          const cleanExamTitle = (paper.titre || paper.libelle || paper.code || "epreuve")
            .replace(/[\\/:*?"<>|]/g, "_")
            .trim();
          
          const examTitleUnique = `${cleanExamTitle}_${paper.id || index}`;

          // Organize downloads into separate folders to keep them tidy on local phones
          const paperClassRaw = paper.classe_libelle || (typeof paper.classe === 'object' ? paper.classe?.libelle : paper.classe);
          const paperClass = paperClassRaw || CLASSES_PRESETS.find(c => String(c.id) === String(rawClassId))?.label || "Classe_Inconnue";

          const paperDisciplineRaw = paper.discipline_libelle || (typeof paper.discipline === 'object' ? paper.discipline?.libelle : paper.discipline);
          const paperDiscipline = paperDisciplineRaw || DISCIPLINES_PRESETS.find(d => String(d.id) === String(rawDisciplineId))?.label || "Discipline_Inconnue";

          const paperYear = paper.annee || "Session_Generale";

          // Clean names used as local filesystem directories
          const cleanClassFolder = String(paperClass).replace(/[\\/:*?"<>|]/g, "_").trim();
          const cleanDisciplineFolder = String(paperDiscipline).replace(/[\\/:*?"<>|]/g, "_").trim();
          const cleanYearFolder = `Session_${String(paperYear).replace(/[\\/:*?"<>|]/g, "_").trim()}`;

          // Formulate the nested relative path in ZIP folder
          const finalZipFilePath = `${cleanClassFolder}/${cleanDisciplineFolder}/${cleanYearFolder}/${examTitleUnique}.${fileExtension}`;

          zip.file(finalZipFilePath, fileData);

          // Update success
          setDownloadQueueProgress(prev => prev.map((item, idx) => 
            idx === index ? { ...item, status: "success", progress: 100 } : item
          ));

        } catch (err: any) {
          if (err.name === "AbortError" || err.message === "Annulé") {
            setDownloadQueueProgress(prev => prev.map((item, idx) => 
              idx === index ? { ...item, status: "idle", progress: 0 } : item
            ));
            return;
          }
          console.error(`Error downloading ${paper.nom_epreuve}:`, err);
          setDownloadQueueProgress(prev => prev.map((item, idx) => 
            idx === index ? { ...item, status: "error", progress: 0, error: err.message || "Erreur de proxy" } : item
          ));
        }
      }
    };

    // Spawn concurrent workers
    const totalWorkers = Math.min(concurrency, selectedList.length);
    const workers = Array.from({ length: totalWorkers }, () => runWorker());
    await Promise.all(workers);

    if (controller.signal.aborted) {
      setDownloading(false);
      return;
    }

    // Pack Zip Archive Stage
    setDownloadStep("packaging");
    setZipProgress(0);
    try {
      const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        setZipProgress(Math.round(metadata.percent));
      });

      // Simple browser download trigger
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      setDownloadStep("completed");
    } catch (zipError) {
      console.error("Failed to generate ZIP", zipError);
    } finally {
      setDownloading(false);
      setZipProgress(null);
    }
  };

  // Helper values for downloader status
  const downloadStats = useMemo(() => {
    const total = downloadQueueProgress.length;
    const completed = downloadQueueProgress.filter(i => i.status === "success").length;
    const errors = downloadQueueProgress.filter(i => i.status === "error").length;
    const processing = downloadQueueProgress.filter(i => i.status === "downloading").length;
    const pending = downloadQueueProgress.filter(i => i.status === "idle").length;
    const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, errors, processing, pending, overallProgress };
  }, [downloadQueueProgress]);

  return (
    <div id="app" className="min-h-screen bg-slate-50 text-slate-800 flex flex-col antialiased selection:bg-teal-500 selection:text-white">
      {/* Dynamic Ribbon colors matching Benin Flag aesthetic */}
      <div className="h-2.5 flex w-full">
        <div className="bg-emerald-600 w-[30%]" title="Émeraude"></div>
        <div className="bg-amber-400 w-[35%]" title="Or"></div>
        <div className="bg-red-600 w-[35%]" title="Feu"></div>
      </div>

      {/* Main Header / Navigation */}
      <header className="bg-white border-b border-slate-100 shadow-xs sticky top-0 z-40 backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-amber-500 rounded-xl shadow-xs text-white">
              <FolderDown size={28} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-slate-900 flex items-center gap-2">
                Hilarus_zone : Banque d'épreuves !
                <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-100 uppercase">
                  Accès Libre
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                Portail autonome pour la recherche et la récupération des épreuves académiques
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* LEFT COLUMN: Filters & Parameters Selection */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-6">
          
          {/* Card: Configuration Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-lg font-bold font-display text-slate-900 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sliders size={18} className="text-emerald-600" />
              Filtres d'exploration
            </h2>

            <div className="space-y-5">
              
              {/* Class Filter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Classe d'étude</label>
                  <button 
                    onClick={() => setUseCustomClassId(!useCustomClassId)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium tracking-tight"
                  >
                    {useCustomClassId ? "Sélectionner dans la liste" : "Spécifier l'ID brute"}
                  </button>
                </div>
                
                {useCustomClassId ? (
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Exemple: 25"
                      value={customClassId}
                      onChange={(e) => setCustomClassId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                    />
                    <span className="absolute right-3 top-3 text-[10px] text-slate-400 font-mono">ID Brute</span>
                  </div>
                ) : (
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:border-emerald-500 focus:outline-hidden transition-colors"
                  >
                    {CLASSES_PRESETS.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.label} {cls.id ? `(ID ${cls.id})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Subject / Discipline Filter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">Matière / Discipline</label>
                  <button 
                    onClick={() => setUseCustomDisciplineId(!useCustomDisciplineId)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium tracking-tight"
                  >
                    {useCustomDisciplineId ? "Sélectionner dans la liste" : "Spécifier l'ID brute"}
                  </button>
                </div>
                
                {useCustomDisciplineId ? (
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Exemple: 6"
                      value={customDisciplineId}
                      onChange={(e) => setCustomDisciplineId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                    />
                    <span className="absolute right-3 top-3 text-[10px] text-slate-400 font-mono">ID Brute</span>
                  </div>
                ) : (
                  <select
                    value={selectedDisciplineId}
                    onChange={(e) => setSelectedDisciplineId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:border-emerald-500 focus:outline-hidden transition-colors"
                  >
                    {DISCIPLINES_PRESETS.map((disc) => (
                      <option key={disc.id} value={disc.id}>
                        {disc.label} {disc.id ? `(ID ${disc.id})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Text Query Filter */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mots-clés de l'épreuve</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Ex: Devoir, Composition..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Record Limit */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 font-display">Limite de résultats à indexer</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                >
                  <option value={50}>50 épreuves</option>
                  <option value={100}>100 épreuves</option>
                  <option value={300}>300 épreuves (Optimal)</option>
                  <option value={500}>500 épreuves</option>
                  <option value={1000}>1000 épreuves</option>
                  <option value={2000}>2000 épreuves (Tout charger)</option>
                </select>
              </div>

              {/* Search Trigger Button */}
              <button
                onClick={handleSearch}
                disabled={loading}
                className="w-full text-white bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 hover:from-emerald-700 hover:to-emerald-950 font-semibold py-3 px-4 rounded-xl shadow-sm cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 text-sm"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
                  <span>{loading ? "Recherche active..." : "Explorer la banque d'épreuves"}</span>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Stats Summary Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Statut du Coffre-Fort</h4>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-medium">Classes Configuées</span>
                <span className="text-lg font-bold font-display text-slate-800">{CLASSES_PRESETS.length - 1}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-medium">Matières Actives</span>
                <span className="text-lg font-bold font-display text-slate-800">{DISCIPLINES_PRESETS.length - 1}</span>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Interactive results folding accordion & download progression */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Active Download Overlay Panel / Screen */}
          <AnimatePresence>
            {downloading && (
              <motion.div 
                id="progress-panel"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-2xl border-2 border-emerald-500 shadow-md overflow-hidden"
              >
                {/* Header of download panel */}
                <div className="bg-emerald-600 text-white p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderDown className="animate-bounce" size={20} />
                    <span className="font-bold font-display">
                      {downloadStep === "fetching" && "Étape 1 : Récupération accélérée des fichiers..."}
                      {downloadStep === "packaging" && "Étape 2 : Assemblage et classement sous dossiers..."}
                      {downloadStep === "completed" && "Étape 3 : Archive finalisée avec succès !"}
                    </span>
                  </div>
                  
                  <button 
                    onClick={handleCancelDownloads}
                    className="text-white hover:bg-emerald-700 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Arrêter le processus"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6">
                  {/* Progression layout */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    
                    {/* Circle / Radial Progress block */}
                    <div className="bg-emerald-50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                      <div className="relative w-24 h-24 mb-3 flex items-center justify-center animate-pulse">
                        <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                          <circle cx="48" cy="48" r="40" stroke="#cbd5e1" strokeWidth="6" fill="transparent" />
                          <circle cx="48" cy="48" r="40" stroke="#059669" strokeWidth="8" fill="transparent" 
                            strokeDasharray={`${2 * Math.PI * 40}`} 
                            strokeDashoffset={`${2 * Math.PI * 40 * (1 - downloadStats.overallProgress / 100)}`} 
                            strokeLinecap="round" 
                          />
                        </svg>
                        <span className="text-2xl font-bold font-display text-emerald-800">{downloadStats.overallProgress}%</span>
                      </div>
                      <p className="text-xs font-semibold text-emerald-900">Avancement des téléchargements</p>
                    </div>

                    {/* Numerical Stats Block */}
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-xs text-slate-500 font-medium">Épreuves récoltées</span>
                        <div className="text-xl font-bold text-slate-900 font-mono mt-2">
                          {downloadStats.completed} / {downloadStats.total}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-xs text-slate-500 font-medium font-display">Flux actifs / En attente</span>
                        <div className="text-xl font-bold text-emerald-600 font-mono mt-2">
                          {downloadStats.processing} / {downloadStats.pending}
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg col-span-2 flex flex-col justify-between">
                        <span className="text-xs text-slate-500 font-medium">Classement dans l'archive ZIP :</span>
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">
                          📂 Nom_Classe / Nom_Matière / Session_Année / Épreuve_Titre.docx
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-2 flex-1 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-700 transition-all duration-300" 
                              style={{ width: `${zipProgress !== null ? zipProgress : 0}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-bold font-mono text-slate-700">
                            {zipProgress !== null ? `Empaquetage : ${zipProgress}%` : "En attente d'empaquetage..."}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Active Green Threads visual list */}
                  <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50">
                    <div className="bg-slate-100 px-4 py-2 flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                      <span>File d'attente active ({concurrency} Flux de téléchargements)</span>
                      <span>Vitesse / Progression</span>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto">
                      {downloadQueueProgress.map((item, idx) => {
                        if (item.status === "idle") return null;
                        return (
                          <div key={idx} className="p-2.5 flex items-center justify-between gap-3 text-xs bg-white">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {item.status === "success" && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
                              {item.status === "downloading" && <RefreshCw size={14} className="text-emerald-500 animate-spin shrink-0" />}
                              {item.status === "error" && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
                              <span className="truncate font-medium text-slate-700 text-xs">
                                {item.paper.titre || item.paper.libelle || item.paper.nom_epreuve}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 font-mono">
                              {item.status === "downloading" && (
                                <>
                                  <span className="text-[10px] text-teal-600 font-semibold bg-teal-50 px-1.5 py-0.5 rounded">
                                    {item.speed || "Actif"}
                                  </span>
                                  <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-teal-600" style={{ width: `${item.progress}%` }}></div>
                                  </div>
                                </>
                              )}
                              {item.status === "success" && (
                                <span className="text-emerald-700 font-semibold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded">
                                  Terminé
                                </span>
                              )}
                              {item.status === "error" && (
                                <span className="text-red-700 font-semibold text-[10px] bg-red-50 px-1.5 py-0.5 rounded" title={item.error}>
                                  Échec
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

              </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN RESULTS CONTAINER CARD */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col min-h-[450px]">
            
            {/* Toolbar Panel */}
            <div className="bg-slate-50/70 border-b border-slate-200 p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-1 font-display">
                  <ListFilter size={14} className="text-emerald-600" />
                  Consulteur des épreuves
                </h3>
                <p className="text-xs text-slate-500">
                  {filteredPapers.length} documents répertoriés.{" "}
                  <span className="font-semibold text-emerald-700 font-mono">{selectedPaperIds.size} épreuves sélectionnées</span>.
                </p>
              </div>

              {/* Fast row filtering / grouping */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                {/* Fast live search input */}
                <div className="relative flex-1 sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
                  <input
                    type="text"
                    placeholder="Filtrer dans la liste..."
                    value={localFilterText}
                    onChange={(e) => setLocalFilterText(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={toggleAllFiltered}
                  disabled={filteredPapers.length === 0}
                  className="bg-white border border-slate-200 text-xs font-semibold hover:border-emerald-600 hover:bg-emerald-50 text-slate-700 cursor-pointer px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <CheckSquare size={13} className="text-emerald-600" />
                  Tout Cocher / Décocher
                </button>
              </div>
            </div>

            {/* FOLDING MODE CONTROL TABS FOR EASY NAVIGATION */}
            <div className="bg-white px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">Grouper par de manière dynamique :</span>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    onClick={() => setGroupingMode("annee")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${groupingMode === "annee" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    Par Session / Année
                  </button>
                  <button
                    onClick={() => setGroupingMode("discipline")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${groupingMode === "discipline" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    Par Matière
                  </button>
                  <button
                    onClick={() => setGroupingMode("simple")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${groupingMode === "simple" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    Plat (Tout déplier)
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setCollapsedGroups(new Set(Object.keys(groupedPapers)))}
                  className="text-[10px] text-slate-500 hover:text-emerald-600 font-bold uppercase transition-colors"
                >
                  Tout Plier
                </button>
                <span className="text-[10px] text-slate-300">|</span>
                <button
                  onClick={() => setCollapsedGroups(new Set())}
                  className="text-[10px] text-slate-500 hover:text-emerald-600 font-bold uppercase transition-colors"
                >
                  Tout Déplier
                </button>
              </div>
            </div>

            {/* SEARCH PROGRESS STEP INNER ALWAYS VISIBLE */}
            {searchProgressStep && (
              <div className="bg-emerald-50/50 text-emerald-800 p-3 px-5 border-b border-emerald-100 text-xs flex items-center gap-2 font-mono">
                <RefreshCw size={12} className="animate-spin text-emerald-600" />
                <span>{searchProgressStep}</span>
              </div>
            )}

            {/* ERROR CARD */}
            {error && (
              <div className="m-5 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={16} />
                <div>
                  <h4 className="font-bold mb-1">Échec de chargement</h4>
                  <p className="leading-relaxed mb-2">{error}</p>
                  <button 
                    onClick={handleSearch} 
                    className="text-[10px] font-bold text-red-900 bg-white border border-red-300 rounded px-2.5 py-1 hover:bg-red-100 uppercase transition-colors"
                  >
                    Essayer à nouveau
                  </button>
                </div>
              </div>
            )}

            {/* LOADING STATE */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <RefreshCw size={44} className="text-emerald-500 animate-spin mb-4" />
                <h3 className="font-bold text-slate-700 mb-1">Lecture en cours...</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Déploiement de l'index des données.
                </p>
              </div>
            ) : filteredPapers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <HelpCircle size={44} className="text-slate-300 mb-4" />
                <h3 className="font-bold text-slate-700 mb-1">Aucune information listée</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Veuillez spécifier une autre classe ou matière dans le panneau gauche.
                </p>
              </div>
            ) : (
              /* GROUPED/COLLAPSIBLE ACCORDION VIEW OF RESULTS */
              <div className="p-4 sm:p-5 space-y-4">
                {(Object.entries(groupedPapers) as Array<[string, ExamPaper[]]>).map(([groupName, items]) => {
                  const isCollapsed = collapsedGroups.has(groupName);
                  const isChecked = isGroupAllSelected(items);
                  
                  return (
                    <div 
                      key={groupName} 
                      className={`border rounded-xl transition-all overflow-hidden ${
                        isCollapsed ? "border-slate-200" : "border-emerald-200 bg-slate-50/20 shadow-xs"
                      }`}
                    >
                      {/* Accordion Header row */}
                      <div 
                        onClick={() => toggleGroupCollapse(groupName)}
                        className={`p-3.5 px-4 flex items-center justify-between gap-3 select-none cursor-pointer transition-colors ${
                          isCollapsed ? "bg-white hover:bg-slate-50/50" : "bg-emerald-50/40 border-b border-emerald-100"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0" onClick={(e) => e.stopPropagation()}>
                          {/* Checked group toggle selection */}
                          <button
                            onClick={() => toggleGroupSelection(items)}
                            className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                            title="Sélectionner ou vider tout le groupe"
                          >
                            {isChecked ? (
                              <CheckSquare size={18} className="text-emerald-600" />
                            ) : (
                              <Square size={18} />
                            )}
                          </button>

                          <div className="flex items-center gap-2 min-w-0" onClick={() => toggleGroupCollapse(groupName)}>
                            {isCollapsed ? (
                              <Folder size={18} className="text-slate-400 shrink-0" />
                            ) : (
                              <FolderOpen size={18} className="text-emerald-600 shrink-0" />
                            )}
                            <span className="font-bold text-sm text-slate-800 truncate">
                              {groupName}
                            </span>
                            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                              {items.length} épreuves
                            </span>
                          </div>
                        </div>

                        {/* Collateral action */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono hidden sm:block">
                            Cliquer pour {isCollapsed ? "ouvrir" : "replier"}
                          </span>
                          {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-emerald-600" />}
                        </div>
                      </div>

                      {/* Accordion Collapsible List of tables */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto bg-white">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                                <th className="py-2.5 px-4 w-12 text-center">Choix</th>
                                <th className="py-2.5 px-4">Nom de l'épreuve</th>
                                <th className="py-2.5 px-4 hidden sm:table-cell">Matière</th>
                                <th className="py-2.5 px-4 w-28 text-center text-emerald-800">DOCX Direct</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {items.map((paper) => {
                                const paperId = paper.id || paper.nom_epreuve;
                                const isItemSelected = selectedPaperIds.has(paperId);
                                const title = paper.titre || paper.libelle || paper.code || "Sans titre";
                                const filename = paper.nom_epreuve;
                                
                                return (
                                  <tr 
                                    key={paperId}
                                    onClick={() => toggleSelectPaper(paperId)}
                                    className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${
                                      isItemSelected ? "bg-emerald-50/10" : ""
                                    }`}
                                  >
                                    {/* Action Selector */}
                                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                      <button 
                                        onClick={() => toggleSelectPaper(paperId)}
                                        className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                      >
                                        {isItemSelected ? (
                                          <CheckSquare size={16} className="text-emerald-600" />
                                        ) : (
                                          <Square size={16} />
                                        )}
                                      </button>
                                    </td>

                                    {/* Title details */}
                                    <td className="py-3 px-4">
                                      <div className="font-semibold text-slate-800 text-[13px] leading-tight">
                                        {title}
                                      </div>
                                      {paper.annee && (
                                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                          Session : {paper.annee} — {filename}
                                        </div>
                                      )}
                                    </td>

                                    {/* Subject */}
                                    <td className="py-3 px-4 hidden sm:table-cell text-slate-600 font-medium">
                                      {paper.discipline_libelle || paper.discipline || "Discipline"}
                                    </td>

                                    {/* Download button */}
                                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                      <a
                                        href={`/api/file?id=${encodeURIComponent(paper.nom_epreuve)}`}
                                        download
                                        className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-white bg-slate-100 hover:bg-emerald-600 border border-slate-200 hover:border-emerald-600 px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer font-mono"
                                        title="Télécharger"
                                      >
                                        <Download size={10} />
                                        DOCX
                                      </a>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* BATCH DOWNLOAD ACTION CONTROL BAR */}
            {papers.length > 0 && !loading && (
              <div className="bg-slate-50 border-t border-slate-200 p-5 mt-auto gap-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between">
                
                {/* Custom compression settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Nom du fichier ZIP final
                    </label>
                    <input
                      type="text"
                      value={zipFileName}
                      onChange={(e) => setZipFileName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-hidden focus:border-emerald-500 font-mono"
                      placeholder="archive.zip"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Vitesse de Téléchargements
                      </label>
                      <span className="text-[10px] font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        {concurrency} Tâches simultanées
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="15"
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Main Action Trigger */}
                <div className="flex items-end justify-end shrink-0">
                  <button
                    onClick={handleBatchDownload}
                    disabled={selectedPaperIds.size === 0 || downloading}
                    className="w-full sm:w-auto text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-6 py-3 rounded-xl shadow-xs cursor-pointer transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <FolderDown size={16} />
                    Télécharger la sélection ({selectedPaperIds.size} épreuves)
                  </button>
                </div>

              </div>
            )}

          </div>

        </div>

      </main>

      {/* Footer bar */}
      <footer className="bg-slate-900 text-slate-400 py-6 text-center border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© 2026 Hilarus_zone : Banque d'épreuves ! - Tout droit réservé.</p>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
            <span className="font-mono text-[10px] text-slate-500">Flux sécurisé crypté</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
