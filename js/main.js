// Written with assistance from Github Copilot

const scatterMargin = { top: 40, right: 40, bottom: 60, left: 80 };
// New main chart globals
let mainSvg = null;
let mainMargin = { top: 24, right: 320, bottom: 36, left: 60 }; // more room for legend
let allGenres = [];
let activeGenres = new Set();

// Add top-level state for responsiveness
let scatterData = null;
let scatterSvg = null;

// New global state for filters + timeline elements
let currentFilters = { genre: 'All', timeExtent: null, priceExtent: null };
let timelineSvg = null;
let timelineBrush = null;

// New distribution globals
let distributionSvg = null;
let distributionBrush = null;

d3.tsv("https://monkeybud.github.io/data/games.tsv", row => {
    row.Releasedate = new Date(row.Releasedate);
    row.Price = +row.Price;

    // compute review count if available
    row._reviews = getReviewCount(row);

    // compute positive/negative breakdown
    const pn = getPositiveNegative(row);
    row._positive = pn.positive;
    row._negative = pn.negative;
    row._posRatio = pn.posRatio;

    return row;
}).then(data => {

    // Remove unwanted genres: "Unknown" and "Nudity"
    const cleanData = data.filter(d => {
        const genreRaw = (d.Genres || d.Genre || '').trim();
        const genre = typeof genreRaw === 'string' ? genreRaw.split(/[;,|]/)[0].trim() : '';
        return genre && genre.toLowerCase() !== 'unknown' && genre.toLowerCase() !== 'nudity' && genre.toLowerCase() !== 'software training';
    });

    function checkOwners(game) {
        return game.Estimatedowners != '0 - 0' &&
               game.Estimatedowners != '0 - 20000' &&
               game.Estimatedowners != '20000 - 50000' &&
               game.Estimatedowners != '50000 - 100000' &&
               game.Estimatedowners != '100000 - 200000' &&
               game.Estimatedowners != '200000 - 500000';
    }

    let filteredData = cleanData.filter(checkOwners);

    let releaseSortedData = filteredData.sort((a, b) => a.Releasedate - b.Releasedate);

    // annotate with review counts (ensure numeric)
    releaseSortedData.forEach(d => {
        if (d._reviews == null) d._reviews = getReviewCount(d);
        d._reviews = +d._reviews || 0;
    });

    // store globally for resize redraws
    scatterData = releaseSortedData;

    // hide loading and reveal main content
    d3.select('#loading').style('display', 'none');
    d3.select('#main-content').classed('hidden', false);

    // populate genre select
    populateGenreSelect(releaseSortedData);

    // create main stacked-area chart
    createMainChart(releaseSortedData);

    // create timeline brush
    createTimeline(releaseSortedData);

    // initial draw of scatter (full)
    createScatterPlot(releaseSortedData);

    // create distribution (price histogram)
    createDistributionChart(releaseSortedData);

    // wire buttons
    d3.select('#apply-filter-btn').on('click', () => {
        const sel = d3.select('#metric-select').property('value');
        currentFilters.genre = sel;
        applyFiltersAndRedraw();
    });

    d3.select('#reset-filter-btn').on('click', () => {
        currentFilters = { genre: 'All', timeExtent: null, priceExtent: null };
        d3.select('#metric-select').property('value', 'All');
        // clear brush(s)
        if (timelineSvg && timelineBrush) timelineSvg.select('.brush').call(timelineBrush.move, null);
        if (distributionSvg && distributionBrush) distributionSvg.select('.dist-brush').call(distributionBrush.move, null);
        applyFiltersAndRedraw();
    });

});


// Redraw on window resize
window.addEventListener('resize', () => {
    if (scatterData) {
        // redraw main + timeline + distribution chart at new size
        createMainChart(scatterData);
        createTimeline(scatterData);
        createDistributionChart(scatterData);
        applyFiltersAndRedraw(); // redraw scatter with current filters (will also recreate timeline/distribution inside)
    }
});

function createScatterPlot(releaseSortedData) {
    const container = d3.select('#scatter-plot');

    // remove previous svg so we can redraw cleanly on resize
    container.selectAll('svg').remove();

    const bounds = container.node().getBoundingClientRect();
    const width = bounds.width - scatterMargin.left - scatterMargin.right;
    const height = bounds.height - scatterMargin.top - scatterMargin.bottom;

    scatterSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${scatterMargin.left},${scatterMargin.top})`);

    // Determine x domain: respect timeline selection if present
    let xDomainStart = new Date(1997, 0, 1);
    let xDomainEnd = d3.max(releaseSortedData, d => d.Releasedate);
    if (currentFilters.timeExtent) {
        // use timeline selection as domain
        xDomainStart = currentFilters.timeExtent[0];
        xDomainEnd = currentFilters.timeExtent[1];
    }

    const xScaleScatter = d3.scaleTime()
        .domain([xDomainStart, xDomainEnd])
        .range([0, width])
        .nice();

    const yScaleScatter = d3.scaleLinear()
        .domain([-2, d3.max(releaseSortedData, d => d.Price)])
        .range([height, 0])
        .nice();

    // setup review-based visual encodings
    const maxReviews = d3.max(releaseSortedData, d => d._reviews || 0) || 1;
    const radiusScale = d3.scaleSqrt()
        .domain([0, maxReviews])
        .range([2, 14]); // min/max radius

    // color: 0 (low positive%) -> red, 1 (high positive%) -> blue
    const colorScale = d3.scaleLinear()
        .domain([0, 1])
        .range(["#d73027", "#4575b4"]); // red -> blue

    const noDataColor = '#7f8c8d'; // neutral grey when no pos/neg info

    // Draw points (size+color by review count / positivity)
    scatterSvg.selectAll('.scatter-dot')
        .data(releaseSortedData)
        .join('circle')
        .attr('class', 'scatter-dot')
        .attr('cx', d => xScaleScatter(d.Releasedate))
        .attr('cy', d => yScaleScatter(d.Price))
        .attr('r', d => radiusScale(d._reviews || 0))
        .attr('fill', d => (d._posRatio == null ? noDataColor : colorScale(d._posRatio)))
        .attr('opacity', 0.85)
        .attr('stroke', '#111')
        .attr('stroke-width', 0.8)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(150)
                .attr('r', Math.max(10, radiusScale(d._reviews || 0) * 1.6))
                .attr('opacity', 1);
            showScatterTooltip(event, d);
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(150)
                .attr('r', d => radiusScale(d._reviews || 0))
                .attr('opacity', 0.85);
            hideTooltip();
        });

    // Axes: adjust ticks when timeline selection is present
    const xAxis = d3.axisBottom(xScaleScatter);
    if (currentFilters.timeExtent) {
        const yearsSpan = xDomainEnd.getFullYear() - xDomainStart.getFullYear();
        if (yearsSpan <= 12) {
            xAxis.ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y'));
        } else {
            xAxis.ticks(8);
        }
    } else {
        xAxis.ticks(8);
    }

    scatterSvg.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

    scatterSvg.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScaleScatter).ticks(8));

    // Horizontal gridlines (y-axis)
    scatterSvg.append('g')
        .attr('class', 'grid grid-y')
        .call(
            d3.axisLeft(yScaleScatter)
                .ticks(8)
                .tickSize(-width)    // extend ticks across chart width
                .tickFormat('')      // remove labels
        );

    // Vertical gridlines (x-axis) - use same tick spacing as axis
    const xGrid = d3.axisBottom(xScaleScatter);
    if (currentFilters.timeExtent) {
        const yearsSpan = xDomainEnd.getFullYear() - xDomainStart.getFullYear();
        if (yearsSpan <= 12) {
            xGrid.ticks(d3.timeYear.every(1)).tickFormat('');
        } else {
            xGrid.ticks(8).tickFormat('');
        }
    } else {
        xGrid.ticks(8).tickFormat('');
    }

    scatterSvg.append('g')
        .attr('class', 'grid grid-x')
        .attr('transform', `translate(0,${height})`)
        .call(xGrid.tickSize(-height));

    // Labels
    scatterSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .text('Release Date');

    scatterSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -55)
        .attr('text-anchor', 'middle')
        .text('Price (USD)');

    // Title
    scatterSvg.append('text')
        .attr('x', width / 2)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', '600')
        .style('fill', '#d6d6d6')
        .text('Release Date vs Price');
}

// New: populate genre select from data (safe parsing)
function populateGenreSelect(data) {
    const genreAccessor = d => (d.Genres || d.Genre || 'Unknown');
    const splitGenre = s => (typeof s === 'string' ? s.split(/[;,|]/)[0].trim() : 'Unknown');
    const genres = Array.from(new Set(data.map(d => splitGenre(genreAccessor(d)) ))).filter(g => g && g !== '');
    const options = ['All', ...genres.sort()];

    const select = d3.select('#metric-select');
    select.selectAll('option').remove();
    select.selectAll('option')
        .data(options)
        .join('option')
        .attr('value', d => d)
        .text(d => d);
}

// New: create small timeline with brush to select time range
function createTimeline(data) {
    const container = d3.select('#timeline');
    container.selectAll('svg').remove();

    const bounds = container.node().getBoundingClientRect();
    const margin = { top: 10, right: 20, bottom: 20, left: 40 };
    const width = bounds.width - margin.left - margin.right;
    const height = bounds.height - margin.top - margin.bottom;

    timelineSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.Releasedate))
        .range([0, width]);

    // draw simple density-like dots (semi-transparent)
    timelineSvg.append('g')
        .selectAll('circle')
        .data(data)
        .join('circle')
        .attr('cx', d => x(d.Releasedate))
        .attr('cy', height / 2)
        .attr('r', 2)
        .attr('fill', '#64acff')
        .attr('opacity', 0.4);

    // x-axis
    timelineSvg.append('g')
        .attr('transform', `translate(0, ${height})`)
        .call(d3.axisBottom(x).ticks(6));

    // label for timeline x-axis
    timelineSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 30)
        .attr('text-anchor', 'middle')
        .text('Release Date');

    // brush
    timelineBrush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on('end', (event) => {
            // ignore programmatic moves (event.sourceEvent is null when moved via code)
            const isUserEvent = !!event.sourceEvent;
            if (!event.selection) {
                // user cleared selection -> update filters
                if (isUserEvent) currentFilters.timeExtent = null;
            } else {
                if (isUserEvent) {
                    const [x0, x1] = event.selection;
                    currentFilters.timeExtent = [x.invert(x0), x.invert(x1)];
                }
            }
            // only trigger a full redraw when this was a real user interaction
            if (isUserEvent) applyFiltersAndRedraw();
        });

    timelineSvg.append('g')
        .attr('class', 'brush')
        .call(timelineBrush);

    // If a timeExtent is active, restore the brush selection (clamped to domain)
    if (currentFilters.timeExtent) {
        const [t0, t1] = currentFilters.timeExtent;
        // clamp the dates to the timeline domain
        const domain = x.domain();
        const clampDate = d => {
            if (d < domain[0]) return domain[0];
            if (d > domain[1]) return domain[1];
            return d;
        };
        const ct0 = clampDate(t0), ct1 = clampDate(t1);
        // only move brush if there is an overlap
        if (ct1 >= domain[0] && ct0 <= domain[1]) {
            const xx0 = x(ct0), xx1 = x(ct1);
            timelineSvg.select('.brush').call(timelineBrush.move, [xx0, xx1]);
        }
    }
}

// New: create price histogram with brush interaction
function createDistributionChart(data) {
    const container = d3.select('#distribution-chart');
    container.selectAll('svg').remove();

    const bounds = container.node().getBoundingClientRect();
    const margin = { top: 10, right: 20, bottom: 30, left: 40 };
    const width = Math.max(200, bounds.width - margin.left - margin.right);
    const height = Math.max(120, bounds.height - margin.top - margin.bottom);

    distributionSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // ----------- FIXED: use full dataset for x-domain -----------
    const allPrices = scatterData
        .map(d => d.Price)
        .filter(p => !isNaN(p) && p >= 0);

    const maxPrice = d3.max(allPrices) || 1;

    const x = d3.scaleLinear()
        .domain([0, maxPrice])
        .range([0, width])
        .nice();

    // bins use filtered data
    const filteredPrices = data
        .map(d => d.Price)
        .filter(p => !isNaN(p) && p >= 0);

    const bins = d3.bin()
        .domain(x.domain())
        .thresholds(20)(filteredPrices);

    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)]).nice()
        .range([height, 0]);

    // bars
    const bars = distributionSvg.append('g').attr('class', 'dist-bars')
        .selectAll('.dist-bar')
        .data(bins)
        .join('rect')
        .attr('class', 'dist-bar')
        .attr('x', d => x(d.x0) + 1)
        .attr('y', d => y(d.length))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
        .attr('height', d => Math.max(0, height - y(d.length)))
        .attr('fill', '#f0c28f')
        .attr('stroke', '#a06e3a')
        .style('cursor', 'pointer')
        .on('mouseover', (event, d) => {
            createTooltip(event, `<div>${d.length} games<br/>${d3.format('$,.2f')(d.x0)} – ${d3.format('$,.2f')(d.x1)}</div>`);
            d3.select(event.currentTarget).attr('fill', '#ffd58a');
        })
        .on('mouseout', (event) => {
            hideTooltip();
            d3.select(event.currentTarget).attr('fill', '#f0c28f');
        });

    // x-axis
    distributionSvg.append('g')
        .attr('transform', `translate(0, ${height})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("$.0f")));

    // y-axis
    distributionSvg.append('g')
        .call(d3.axisLeft(y).ticks(3));

    // ----------- brush for selecting price range -----------
    distributionBrush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on('start brush end', (event) => {
            const sel = event.selection;

            // highlight overlapping bins
            bars.classed('selected', d => {
                if (!sel) return false;
                const [x0, x1] = sel;
                const b0 = x(d.x0), b1 = x(d.x1);
                return b1 >= x0 && b0 <= x1;
            });

            // only act on user-triggered "end" events
            if (event.type === 'end') {
                const isUserEvent = !!event.sourceEvent;
                if (!isUserEvent) return;

                if (!sel) {
                    currentFilters.priceExtent = null;
                } else {
                    const [x0, x1] = sel;
                    currentFilters.priceExtent = [x.invert(x0), x.invert(x1)];
                }
                applyFiltersAndRedraw();
            }
        });

    distributionSvg.append('g')
        .attr('class', 'dist-brush')
        .call(distributionBrush);

    // restore brush selection if there is a price filter
    if (currentFilters.priceExtent) {
        const [p0, p1] = currentFilters.priceExtent;
        distributionSvg.select('.dist-brush')
            .call(distributionBrush.move, [x(p0), x(p1)]);
    }

    // x-axis label
    distributionSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 25)
        .attr('text-anchor', 'middle')
        .text('Price (USD)');

    // y-axis label
    distributionSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -30)
        .attr('text-anchor', 'middle')
        .text('Count');

    // title
    distributionSvg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 350)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', '600')
        .style('fill', '#d6d6d6')
        .text('Price Distribution');
}


// New: createMainChart - stacked area by genre + overlay avg pos% line
function createMainChart(data) {
    const container = d3.select('#main-chart');
    container.selectAll('svg').remove();

    const bounds = container.node().getBoundingClientRect();
    const width = Math.max(300, bounds.width - mainMargin.left - mainMargin.right);
    const height = Math.max(140, bounds.height - mainMargin.top - mainMargin.bottom);

    mainSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${mainMargin.left},${mainMargin.top})`);

    // prepare genre list (primary genre token)
    const genreOf = d => {
        const g = (d.Genres || d.Genre || 'Unknown');
        return (typeof g === 'string') ? g.split(/[;,|]/)[0].trim() : g;
    };
    allGenres = Array.from(new Set(data.map(d => genreOf(d)).filter(Boolean))).sort();
    if (activeGenres.size === 0) allGenres.forEach(g => activeGenres.add(g));

    // aggregate counts per year × genre and avg posRatio per year
    const yearSet = new Set();
    data.forEach(d => yearSet.add(d.Releasedate.getFullYear()));
    const years = Array.from(yearSet).sort((a,b) => a-b);
    const seriesData = years.map(y => {
        const row = { year: new Date(y, 0, 1) };
        allGenres.forEach(g => row[g] = 0);
        const items = data.filter(d => d.Releasedate.getFullYear() === y);
        items.forEach(d => {
            const g = genreOf(d);
            row[g] = (row[g] || 0) + 1;
        });
        // compute avg posRatio (use only defined values)
        const posVals = items.map(d => d._posRatio).filter(v => v != null && !isNaN(v));
        row._avgPos = posVals.length ? d3.mean(posVals) : null;
        row._count = items.length;
        return row;
    });

    // keys are the active genres (respect toggles)
    const keys = allGenres.filter(g => activeGenres.has(g));

    // stack layout
    const stack = d3.stack().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const stacked = stack(seriesData);

    const x = d3.scaleTime()
        .domain(d3.extent(seriesData, d => d.year))
        .range([0, width]);

    const yLeft = d3.scaleLinear()
        .domain([0, d3.max(seriesData, d => {
            return keys.reduce((sum, k) => sum + (d[k] || 0), 0);
        }) * 1.05 || 1])
        .range([height, 0])
        .nice();

    const yRight = d3.scaleLinear()
        .domain([0, 1]) // pos ratio 0..1
        .range([height, 0]);

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(allGenres);

    // area generator for stacks
    const area = d3.area()
        .x(d => x(d.data.year))
        .y0(d => yLeft(d[0]))
        .y1(d => yLeft(d[1]))
        .curve(d3.curveMonotoneX);

    // draw stacks
    const layer = mainSvg.selectAll('.layer')
        .data(stacked, d => d.key)
        .join('g')
        .attr('class', 'layer');

    layer.append('path')
        .attr('class', 'area')
        .attr('d', d => area(d))
        .attr('fill', d => color(d.key))
        .attr('opacity', 0.9)
        .on('mouseover', function(event, d) {
            d3.select(this).attr('opacity', 1);
        })
        .on('mouseout', function() {
            d3.select(this).attr('opacity', 0.9);
        });

    // axes
    mainSvg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(Math.min(12, years.length)).tickFormat(d3.timeFormat('%Y')));

    // x-axis label
    mainSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 30)
        .attr('text-anchor', 'middle')
        .text('Release Year');

    mainSvg.append('g')
        .call(d3.axisLeft(yLeft).ticks(4));

    // left y-axis label
    mainSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -44)
        .attr('text-anchor', 'middle')
        .text('Number of Releases');

    mainSvg.append('g')
        .attr('transform', `translate(${width},0)`)
        .call(d3.axisRight(yRight).ticks(4).tickFormat(d3.format('.0%')));

    // legend background box (placed in the right margin area)
    const legend = mainSvg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${width + 34}, 8)`);

    const legendBoxWidth = 220;
    const legendBoxHeight = Math.max(20, allGenres.length * 20 + 12);
    legend.append('rect')
        .attr('class', 'legend-box')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', legendBoxWidth)
        .attr('height', legendBoxHeight)
        .attr('rx', 6)
        .attr('ry', 6)
        .attr('fill', 'rgba(10,12,14,0.78)')
        .attr('stroke', 'rgba(255,255,255,0.06)');

    const legendItems = legend.selectAll('.legend-item')
        .data(allGenres)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(120, ${12 + i * 20})`)
        .style('cursor', 'pointer')
        .on('click', (event, g) => {
            if (activeGenres.has(g)) activeGenres.delete(g); else activeGenres.add(g);
            createMainChart(data);
        });

    const colour = d3.scaleOrdinal()
        .domain(allGenres)
        .range(d3.schemeCategory10.concat(d3.schemeSet3)); // handles more than 10 genres
    

    legendItems.append('rect')
        .attr('x', 0)
        .attr('y', -10)
        .attr('width', 14)
        .attr('height', 14)
        .attr('fill', d => colour(d))
        .attr('opacity', d => activeGenres.has(d) ? 1 : 0.24)
        .attr('stroke', '#000');

    legendItems.append('text')
        .attr('x', 20)
        .attr('y', 0)
        .attr('fill', '#d6d6d6')
        .style('font-size', '12px')
        .text(d => d);

    // right y-axis title: position it just to the right of the chart (left of the legend)
    mainSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', `translate(${width + 100}, ${height / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .text('Average Positive Reviews (%)');

        // Title
    mainSvg.append('text')
        .attr('x', width / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', '600')
        .style('fill', '#d6d6d6')
        .text('Video Game Releases and Player Ratings Over Time');

    // overlay line for avg positive ratio
    const line = d3.line()
        .defined(d => d._avgPos != null)
        .x(d => x(d.year))
        .y(d => yRight(d._avgPos))
        .curve(d3.curveMonotoneX);

    mainSvg.append('path')
        .datum(seriesData)
        .attr('class', 'avg-pos-line')
        .attr('d', line)
        .attr('stroke', '#64acff')
        .attr('stroke-width', 2)
        .attr('fill', 'none');

    // markers for avg pos with tooltips & click-to-filter by year
    mainSvg.append('g')
        .selectAll('.avg-point')
        .data(seriesData.filter(d => d._avgPos != null))
        .join('circle')
        .attr('class', 'avg-point')
        .attr('cx', d => x(d.year))
        .attr('cy', d => yRight(d._avgPos))
        .attr('r', 4)
        .attr('fill', '#64acff')
        .attr('stroke', '#0b2a44')
        .style('cursor', 'pointer')
        .on('mouseover', (event, d) => {
            createTooltip(event, `${d._count} releases • avg positive ${(d._avgPos*100).toFixed(1)}% (${d3.timeFormat('%Y')(d.year)})`);
        })
        .on('mouseout', hideTooltip)
        .on('click', (event, d) => {
            // click a year => set time filter to that year
            const yr = d.year.getFullYear();
            currentFilters.timeExtent = [new Date(yr,0,1), new Date(yr,11,31,23,59,59)];
            // update timeline and scatter via applyFiltersAndRedraw
            applyFiltersAndRedraw();
        });
}

function applyFiltersAndRedraw() {
    if (!scatterData) return;
    let filtered = scatterData;

    // genre filter
    if (currentFilters.genre && currentFilters.genre !== 'All') {
        filtered = filtered.filter(d => {
            const g = (d.Genres || d.Genre || 'Unknown');
            const first = (typeof g === 'string' ? g.split(/[;,|]/)[0].trim() : g);
            return first === currentFilters.genre;
        });
    }

    // time filter
    if (currentFilters.timeExtent) {
        const [t0, t1] = currentFilters.timeExtent;
        filtered = filtered.filter(d => d.Releasedate >= t0 && d.Releasedate <= t1);
    }

    // price filter
    if (currentFilters.priceExtent) {
        const [p0, p1] = currentFilters.priceExtent;
        filtered = filtered.filter(d => d.Price >= p0 && d.Price <= p1);
    }

    // 🔥 FIX: Timeline should always receive full data, NEVER filtered
    createTimeline(scatterData);

    createMainChart(filtered);
    createDistributionChart(filtered);
    createScatterPlot(filtered);

    updateActiveFiltersBadge();
}


// New: display active filters
function updateActiveFiltersBadge() {
    const container = d3.select('#active-filters');
    container.selectAll('*').remove();
    const badges = [];

    if (currentFilters.genre && currentFilters.genre !== 'All') {
        badges.push({ text: `Genre: ${currentFilters.genre}` });
    }
    if (currentFilters.timeExtent) {
        const [t0, t1] = currentFilters.timeExtent;
        badges.push({ text: `Date: ${d3.timeFormat('%Y-%m-%d')(t0)} → ${d3.timeFormat('%Y-%m-%d')(t1)}` });
    }
    if (currentFilters.priceExtent) {
        const [p0, p1] = currentFilters.priceExtent;
        badges.push({ text: `Price: $${p0.toFixed(2)} → $${p1.toFixed(2)}` });
    }

    const b = container.selectAll('.badge')
        .data(badges)
        .join('span')
        .attr('class', 'badge')
        .style('margin-right', '6px')
        .text(d => d.text);
}

function showScatterTooltip(event, d) {
    const reviewsText = (d._reviews != null) ? `${d._positive + d._negative} reviews` : 'No review data';
    let posText = '';
    if (d._posRatio == null) {
        posText = 'Positive %: N/A';
    } else {
        const pct = (d._posRatio * 100);
        posText = `${(d._positive != null ? d._positive : '?')} positive • ${(d._negative != null ? d._negative : '?')} negative • ${pct.toFixed(1)}% positive`;
    }

    createTooltip(event, `
        <div class="stat">
            <span class="value">${d.Name}</span>
        </div>
        <div>
            <span>$${Number(d.Price).toFixed(2)} • ${reviewsText}</span>
        </div>
        <div style="margin-top:6px; font-size:12px; color:#cfcfcf;">
            ${posText}
        </div>
    `);
}

function createTooltip(event, html) {
    let tooltip = d3.select('.tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
    }

    tooltip.html(html)
        // Use pageX/pageY for consistent positioning when page is scrolled
        .style('left', (event.pageX + 15) + 'px')
        .style('top',  (event.pageY - 15) + 'px')
        .transition()
        .duration(200)
        .style('opacity', 1);
}

function hideTooltip() {
    // fade out and remove only after transition ends
    d3.selectAll('.tooltip')
        .transition()
        .duration(200)
        .style('opacity', 0)
        .on('end', function() { d3.select(this).remove(); });
}

// helper: infer numeric review count from common field names
function getReviewCount(row) {
	// check common possibilities, return 0 if none found
	const candidates = ['Reviews', 'TotalReviews', 'ReviewCount', 'Review_Count', 'AllReviews', 'Positive', 'Negative', 'OwnersReviews', 'Review_Counts'];
	for (const key of candidates) {
		if (key in row && row[key] !== undefined && row[key] !== '') {
			const v = +row[key];
			if (!isNaN(v)) return v;
		}
	}
	// some datasets store positive/negative separately -> try to sum
	const posKeys = ['Positive', 'positivereviews', 'PositiveReviews'];
	const negKeys = ['Negative', 'negativereviews', 'NegativeReviews'];
	let pos = null, neg = null;
	for (const k of posKeys) if (k in row && row[k] !== '') pos = +row[k];
	for (const k of negKeys) if (k in row && row[k] !== '') neg = +row[k];
	if (isFinite(pos) && isFinite(neg)) return Math.max(0, pos + neg);
	return 0;
}

// New helper: detect positive/negative review counts and compute ratio
function getPositiveNegative(row) {
    // common candidate field names for positive/negative counts
    const posKeys = ['Positive', 'PositiveReviews', 'positivereviews', 'positive_reviews', 'Positives'];
    const negKeys = ['Negative', 'NegativeReviews', 'negativereviews', 'negative_reviews', 'Negatives'];

    let positive = null, negative = null;

    for (const k of posKeys) {
        if (k in row && row[k] !== '') {
            const v = +row[k];
            if (!isNaN(v)) { positive = v; break; }
        }
    }
    for (const k of negKeys) {
        if (k in row && row[k] !== '') {
            const v = +row[k];
            if (!isNaN(v)) { negative = v; break; }
        }
    }

    // if explicit pos/neg not found, try to infer from other fields
    if (positive == null && negative == null) {
        // sometimes a single "Positive" or "Reviews" contains total/summary; try patterns
        if ('Positive' in row && row['Positive'] !== '') positive = +row['Positive'];
        if ('Negative' in row && row['Negative'] !== '') negative = +row['Negative'];
    }

    // if both present compute ratio
    if (isFinite(positive) && isFinite(negative)) {
        const total = positive + negative;
        const ratio = total > 0 ? positive / total : null;
        return { positive, negative, posRatio: ratio };
    }

    // fallback: try percentage fields (e.g., "PercentPositive" like 0.85 or "PctPositive")
    const pctKeys = ['PercentPositive', 'Percent_Positive', 'PctPositive', 'pct_positive', 'positive_ratio'];
    for (const k of pctKeys) {
        if (k in row && row[k] !== '') {
            const v = +row[k];
            if (!isNaN(v)) {
                const ratio = v > 1 ? (v / 100) : v;
                return { positive: null, negative: null, posRatio: Math.max(0, Math.min(1, ratio)) };
            }
        }
    }

    // last resort: try to glean positive from sentiment columns or return nulls
    return { positive: null, negative: null, posRatio: null };
}