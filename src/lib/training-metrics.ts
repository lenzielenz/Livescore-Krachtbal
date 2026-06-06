// Gedeelde metadata voor de trainingsmetingen — gebruikt door het invoerformulier én de grafieken.
// Eén bron van waarheid: voeg hier een metriek toe (en in de Trainingmetingen-collectie) om ze
// overal te laten verschijnen.
export type TrainingMetricKey =
  | 'snelheidVooruit'
  | 'snelheidAchteruit'
  | 'worp4'
  | 'worp9'
  | 'worp18'

export type TrainingMetric = {
  key: TrainingMetricKey
  label: string
  kort: string
  unit: string
  /** Worpen krijgen 3 kansen; de beste worp telt als meetwaarde. */
  pogingen?: boolean
}

export const TRAINING_METRICS: TrainingMetric[] = [
  { key: 'snelheidVooruit', label: 'Snelheid vooruit', kort: 'Vooruit', unit: 'm/s' },
  { key: 'snelheidAchteruit', label: 'Snelheid achteruit', kort: 'Achteruit', unit: 'm/s' },
  { key: 'worp4', label: 'Werpafstand · aanloop 4 m', kort: 'Worp 4 m', unit: 'm', pogingen: true },
  { key: 'worp9', label: 'Werpafstand · aanloop 9 m', kort: 'Worp 9 m', unit: 'm', pogingen: true },
  { key: 'worp18', label: 'Werpafstand · aanloop 18 m', kort: 'Worp 18 m', unit: 'm', pogingen: true },
]

/** Aantal kansen per metriek (worpen: 3, de rest: 1). */
export const metricAttempts = (m: TrainingMetric): number => (m.pogingen ? 3 : 1)

// Één meting zoals de client ze gebruikt (speler-id + datum + de meetwaarden, null = niet gemeten).
export type TrainingMeting = {
  speler: number
  datum: string
} & Record<TrainingMetricKey, number | null>
