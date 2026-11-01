import "./ui.css";

export type SegmentedOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

export type SegmentedControlProps<T extends string = string> = {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Card layout (label + description) instead of the compact pill layout. */
  cards?: boolean;
  className?: string;
};

/** Token-only segmented / radio group used by settings surfaces. */
export function SegmentedControl<T extends string>({ label, value, options, onChange, cards = false, className = "" }: SegmentedControlProps<T>) {
  return (
    <div
      className={`ef-ui-seg${cards ? " ef-ui-seg--cards" : ""} ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
      style={cards ? { gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="ef-ui-seg-option"
          onClick={() => onChange(option.value)}
        >
          <span className="ef-ui-seg-label">{option.label}</span>
          {option.description ? <span className="ef-ui-seg-description">{option.description}</span> : null}
        </button>
      ))}
    </div>
  );
}
