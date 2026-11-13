import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDownToLine, Check, ChevronDown, CircleHelp, RotateCcw } from 'lucide-react'
import VehicleScene from './components/VehicleScene'
import VehicleSelector from './components/VehicleSelector'
import { PAINTS, REGIONS, parsePlate, formatPlate, type CarConfiguration, type WheelFinish } from './types'
import { getVehicleById, type VehicleId } from './vehicleRegistry'
import { WHEEL_FINISHES, WHEEL_FINISH_ORDER } from './wheelFinishes'
import { availableWheelDesigns, resolvedWheelDesign } from './wheelDesigns'
import { activateVehicle, createConfigurationExport, getDefaultVehicleConfig, getSessionConfig, migrateV1ToV2, readVehicleSession, resetVehicleConfig, saveVehicleConfig, type VehicleStorage } from './vehicleStorage'
const BODY_FINISHES = [
  { value: 'glossy', label: 'Glossy' },
  { value: 'matte', label: 'Matte' },
  { value: 'satin', label: 'Satin' },
  { value: 'metallic', label: 'Metallic' },
] as const
const BUMPER_FINISHES = [{ value: 'body', label: 'Match body' }, ...BODY_FINISHES] as const
const TINT_OPTIONS = [
  { value: 'clear', label: 'Clear' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'dark', label: 'Dark' },
] as const
type SectionId = 'vehicle' | 'exterior' | 'wheels' | 'plate' | 'body'

function paintCheckColor(hex: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  return channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 > 145 ? '#17202a' : '#fff'
}

function browserStorage(): VehicleStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function AccordionSection({ id, title, open, onToggle, children }: {
  id: SectionId
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="accordion-section">
      <h3>
        <button type="button" className="accordion-trigger" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}>
          <span>{title}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
      </h3>
      <div id={`${id}-panel`} className="accordion-panel" hidden={!open}>{children}</div>
    </section>
  )
}

export default function App() {
  const [session, setSession] = useState(() => readVehicleSession(browserStorage()))
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [openSection, setOpenSection] = useState<SectionId | null>('exterior')
  const config = getSessionConfig(session)
  const vehicle = getVehicleById(session.activeVehicleId)
  const features = vehicle?.features
  const plate = parsePlate(config.plate)
  const wheelDesigns = availableWheelDesigns(session.activeVehicleId)
  const activeWheelDesign = resolvedWheelDesign(session.activeVehicleId, config.wheelDesign)

  useEffect(() => {
    try { migrateV1ToV2(browserStorage()) }
    catch { setNotice({ text: 'Сакталган конфигурацияны жаңыртуу мүмкүн болгон жок.', error: true }) }
  }, [])

  const update = <K extends keyof CarConfiguration>(key: K, value: CarConfiguration[K]) => {
    const requiredFeature = {
      color: 'bodyPaint', bodyFinish: 'bodyFinish', frontBumperFinish: 'frontBumper', rearBumperFinish: 'rearBumper', carbonHood: 'carbonHood', wheelFinish: 'wheelFinish',
      wheelDesign: 'wheelDesign', tint: 'windowTint', plate: 'frontPlate', spoiler: 'spoiler',
    } as const
    if (!features?.[requiredFeature[key]]) return
    setSession((previous) => {
      const activeId = previous.activeVehicleId
      const current = previous.configurations[activeId] ?? getDefaultVehicleConfig(activeId)
      return { ...previous, configurations: { ...previous.configurations, [activeId]: { ...current, [key]: value } } }
    })
    setNotice(null)
  }
  const updatePlate = (region: string, digits: string, letters: string) => {
    update('plate', formatPlate(region, digits, letters))
  }
  const toggleSection = (id: SectionId) => setOpenSection((previous) => previous === id ? null : id)
  const selectVehicle = (id: VehicleId) => {
    setSession((previous) => activateVehicle(previous, id))
    setNotice(null)
  }

  const save = () => {
    try {
      saveVehicleConfig(browserStorage(), session.activeVehicleId, config)
      setNotice({ text: 'Конфигурация браузерде сакталды', error: false })
    } catch {
      setNotice({ text: 'Конфигурацияны сактоо мүмкүн болгон жок', error: true })
    }
  }
  const reset = () => {
    const activeId = session.activeVehicleId
    setSession((previous) => {
      const configurations = { ...previous.configurations }
      delete configurations[activeId]
      return { ...previous, configurations }
    })
    try {
      resetVehicleConfig(browserStorage(), activeId)
      setNotice({ text: 'Баштапкы абалга келтирилди', error: false })
    } catch {
      setNotice({ text: 'Баштапкы абал коюлду, бирок сакталган конфигурация өчүрүлгөн жок', error: true })
    }
  }
  const download = () => {
    const blob = new Blob([JSON.stringify(createConfigurationExport(session.activeVehicleId, config), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${session.activeVehicleId}-config.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon" aria-hidden="true">F<span>.</span></div><span>FORM<span className="brand-muted"> / AUTOMOTIVE</span></span></div>
        <button type="button" className="reset-btn" onClick={reset}><RotateCcw size={15} aria-hidden="true" /><span>Reset</span></button>
      </header>
      <main className="workspace">
        <section className="viewer-pane" aria-label="3D car viewer">
          <div className="viewer-heading"><h1>{getVehicleById(session.activeVehicleId)?.displayName ?? 'Concept GT'}</h1><span>3D CONFIGURATOR</span></div>
          <VehicleScene vehicleId={session.activeVehicleId} config={config} />
        </section>
        <aside className="sidebar" aria-label="Vehicle customization">
          <div className="sidebar-head"><h2>Customize</h2><span>{vehicle?.displayName ?? 'Concept GT'}</span></div>
          <div className="feature-summary" aria-label="Available customization">
            <span>Available</span>
            {features?.bodyPaint && <strong>Paint</strong>}
            {features?.bodyFinish && <strong>Body finish</strong>}
            {features?.wheelDesign && <strong>Wheel designs</strong>}
            {features?.wheelFinish && <strong>Wheel finish</strong>}
            {features?.frontPlate && features.rearPlate && <strong>KG plates</strong>}
          </div>
          <div className="sidebar-scroll">
            <AccordionSection id="vehicle" title="Vehicle" open={openSection === 'vehicle'} onToggle={() => toggleSection('vehicle')}>
              <VehicleSelector activeVehicleId={session.activeVehicleId} onSelect={selectVehicle} />
            </AccordionSection>
            <AccordionSection id="exterior" title="Exterior" open={openSection === 'exterior'} onToggle={() => toggleSection('exterior')}>
              <div className="swatches" role="group" aria-label="Paint color">{PAINTS.map((paint) => <button key={paint.value} type="button" className={`swatch ${config.color === paint.value ? 'selected' : ''}`} style={{ backgroundColor: paint.value }} disabled={!features?.bodyPaint} onClick={() => update('color', paint.value)} aria-label={paint.label} aria-pressed={config.color === paint.value} title={paint.label}>{config.color === paint.value && <Check size={16} color={paintCheckColor(paint.value)} aria-hidden="true" />}</button>)}</div>
              <div className="value-row"><span>Paint</span><strong>{PAINTS.find((p) => p.value === config.color)?.label || 'Custom'}</strong></div>
              <div className="finish-control">
                <div className="value-row"><span>Body Finish</span><strong>{BODY_FINISHES.find((option) => option.value === config.bodyFinish)?.label}</strong></div>
                <div className="finish-options" role="group" aria-label="Body finish">
                  {BODY_FINISHES.map((option) => <button key={option.value} type="button" disabled={!features?.bodyFinish} aria-pressed={config.bodyFinish === option.value} onClick={() => update('bodyFinish', option.value)}>{option.label}</button>)}
                </div>
              </div>
              <fieldset className="feature-fieldset" disabled={!features?.windowTint}><div className="tint-control">
                <div className="value-row"><span>Window Tint</span><strong>{TINT_OPTIONS.find((option) => option.value === config.tint)?.label}</strong></div>
                <div className="tint-options" role="group" aria-label="Window tint level">
                  {TINT_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={config.tint === option.value} onClick={() => update('tint', option.value)}>{option.label}</button>)}
                </div>
              </div></fieldset>
              {!features?.windowTint && <p className="note">{vehicle?.featureNotes.windowTint ?? 'Window glass mapping is not verified.'}</p>}
            </AccordionSection>
            <AccordionSection id="wheels" title="Wheels" open={openSection === 'wheels'} onToggle={() => toggleSection('wheels')}>
              <fieldset className="feature-fieldset" disabled={!features?.wheelDesign}>
              <div className="value-row wheel-design-label"><span>Rim Design</span><strong>{wheelDesigns.find((option) => option.value === activeWheelDesign)?.label ?? 'Unavailable'}</strong></div>
              <div className="wheel-design-options" role="group" aria-label="Wheel rim design">
                {wheelDesigns.map((option) => <button key={option.value} type="button" aria-pressed={activeWheelDesign === option.value} onClick={() => update('wheelDesign', option.value)}>{option.label}</button>)}
              </div>
              </fieldset>
              {!features?.wheelDesign && <p className="note">{vehicle?.featureNotes.wheelDesign ?? 'Rim fitment is not verified.'}</p>}
              <fieldset className="feature-fieldset" disabled={!features?.wheelFinish}>
              <div className="value-row wheel-finish-label"><span>Finish</span><strong>{config.wheelFinish}</strong></div>
              <div className="segmented" role="group" aria-label="Wheel finish">{WHEEL_FINISH_ORDER.map((item: WheelFinish) => <button key={item} type="button" className={config.wheelFinish === item ? 'active' : ''} aria-pressed={config.wheelFinish === item} onClick={() => update('wheelFinish', item)}>{WHEEL_FINISHES[item].label}</button>)}</div>
              </fieldset>
              {!features?.wheelFinish && <p className="note">{vehicle?.featureNotes.wheelFinish ?? 'Wheel material mapping is not verified.'}</p>}
            </AccordionSection>
            <AccordionSection id="plate" title="License Plate" open={openSection === 'plate'} onToggle={() => toggleSection('plate')}>
              <fieldset className="feature-fieldset" disabled={!features?.frontPlate || !features?.rearPlate}>
              <label className="input-label" htmlFor="plate-region">Аймактын коду</label>
              <select id="plate-region" className="plate-input" value={plate.region} onChange={(event) => updatePlate(event.target.value, plate.digits, plate.letters)}>
                {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
              <div className="plate-fields">
                <div><label className="input-label" htmlFor="plate-digits">Үч цифра</label><input id="plate-digits" className="plate-input" inputMode="numeric" maxLength={3} value={plate.digits} onChange={(event) => updatePlate(plate.region, event.target.value.replace(/\D/g, '').slice(0, 3), plate.letters)} placeholder="777" /></div>
                <div><label className="input-label" htmlFor="plate-letters">Үч тамга (латын)</label><input id="plate-letters" className="plate-input" maxLength={3} value={plate.letters} onChange={(event) => updatePlate(plate.region, plate.digits, event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} placeholder="AAB" /></div>
              </div>
              <div className="plate-preview" aria-label={`Кыргызстан номери ${config.plate}`}><div className="plate-preview-region"><b>{plate.region}</b><small>🇰🇬 KG</small></div><strong>{plate.digits || '···'} {plate.letters || '···'}</strong></div>
              <p className="note">Демо номер. Юридикалык жарактуулугу текшерилбейт.</p>
              </fieldset>
              {(!features?.frontPlate || !features?.rearPlate) && <p className="note" role="status">{vehicle?.featureNotes.frontPlate ?? 'Алдыңкы жана арткы номердин бекитүү чекиттери азырынча такталган эмес.'}</p>}
            </AccordionSection>
            <AccordionSection id="body" title="Body Options" open={openSection === 'body'} onToggle={() => toggleSection('body')}>
              <label className="toggle-row"><span><strong>Rear spoiler</strong><small>{features?.spoiler ? 'Sport wing' : vehicle?.featureNotes.spoiler}</small></span><input type="checkbox" disabled={!features?.spoiler} checked={features?.spoiler ? config.spoiler : false} onChange={(event) => update('spoiler', event.target.checked)} /><span className="switch" aria-hidden="true" /></label>
              <label className="toggle-row body-option-divider"><span><strong>Carbon Fiber Hood</strong><small>{features?.carbonHood ? 'Woven finish' : vehicle?.featureNotes.carbonHood}</small></span><input type="checkbox" disabled={!features?.carbonHood} checked={features?.carbonHood ? config.carbonHood : false} onChange={(event) => update('carbonHood', event.target.checked)} /><span className="switch" aria-hidden="true" /></label>
              {features?.frontBumper && <div className="finish-control"><div className="value-row"><span>Front bumper finish</span><strong>{BUMPER_FINISHES.find((option) => option.value === config.frontBumperFinish)?.label}</strong></div><div className="finish-options bumper-options" role="group" aria-label="Front bumper finish">{BUMPER_FINISHES.map((option) => <button key={option.value} type="button" aria-pressed={config.frontBumperFinish === option.value} onClick={() => update('frontBumperFinish', option.value)}>{option.label}</button>)}</div></div>}
              {features?.rearBumper && <div className="finish-control"><div className="value-row"><span>Rear bumper finish</span><strong>{BUMPER_FINISHES.find((option) => option.value === config.rearBumperFinish)?.label}</strong></div><div className="finish-options bumper-options" role="group" aria-label="Rear bumper finish">{BUMPER_FINISHES.map((option) => <button key={option.value} type="button" aria-pressed={config.rearBumperFinish === option.value} onClick={() => update('rearBumperFinish', option.value)}>{option.label}</button>)}</div></div>}
              {!features?.frontBumper && <p className="note">Front bumper: {vehicle?.featureNotes.frontBumper ?? 'No verified styling adapter.'}</p>}
              {!features?.rearBumper && <p className="note">Rear bumper: {vehicle?.featureNotes.rearBumper ?? 'No verified styling adapter.'}</p>}
            </AccordionSection>
          </div>
          <div className="sidebar-bottom">
            <button type="button" className="primary-btn" onClick={save}>Save configuration <Check size={16} aria-hidden="true" /></button>
            <button type="button" className="secondary-btn" onClick={download}><ArrowDownToLine size={16} aria-hidden="true" /> Export JSON</button>
            {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'} aria-live={notice.error ? 'assertive' : 'polite'}>{notice.error ? <CircleHelp size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}{notice.text}</div>}
          </div>
        </aside>
      </main>
      <footer className="footer"><span>FORM / AUTOMOTIVE</span><span>3D model: <a href={vehicle?.license.sourceUrl} target="_blank" rel="noreferrer">{vehicle?.id === 'concept-gt' ? 'Khronos CarConcept' : vehicle?.id === 'toyota-camry-2018' ? 'Toyota Camry 2018 by DR1KING100K on Sketchfab' : 'BMW M5 F90 by RES1N on Sketchfab'}</a> · <a href={vehicle?.license.termsUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>{vehicle?.id === 'toyota-camry-2018' ? ' · Wheel LOD modified prototype' : ''}</span><p className="footer-disclaimer">This is an independent, unofficial 3D configurator created for demonstration and educational purposes. It is not affiliated with, sponsored by, or endorsed by BMW or Toyota. All trademarks belong to their respective owners.</p></footer>
    </div>
  )
}
