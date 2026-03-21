export default function FilterBar({
  categories,
  activeCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
  scoreFilter,
  onScoreFilterChange,
  photoCount
}) {
  return (
    <div className="filter-bar">
      <div className="filter-categories">
        {categories.map(cat => (
          <button
            key={cat}
            className={`cat-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => onCategoryChange(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="filter-right">
        <div className="score-range-group">
          <span>점수</span>
          <input
            type="number"
            className="score-input"
            min="0" max="10" step="0.5"
            value={scoreFilter[0]}
            onChange={e => onScoreFilterChange([Number(e.target.value), scoreFilter[1]])}
          />
          <span>~</span>
          <input
            type="number"
            className="score-input"
            min="0" max="10" step="0.5"
            value={scoreFilter[1]}
            onChange={e => onScoreFilterChange([scoreFilter[0], Number(e.target.value)])}
          />
        </div>

        <select className="sort-select" value={sortBy} onChange={e => onSortChange(e.target.value)}>
          <option value="date">최신순</option>
          <option value="totalScore">점수순</option>
        </select>

        <span className="photo-count">{photoCount}장</span>
      </div>
    </div>
  );
}
