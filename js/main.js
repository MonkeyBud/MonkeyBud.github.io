const scatterMargin = { top: 40, right: 40, bottom: 60, left: 80 };

d3.csv("data/games.csv", row => {

    
    //row.AppID = Number(row.AppID);
    row.Releasedate = new Date(row.Releasedate);
    row.Price = +row.Price;
    //console.log(row);
    return row;
}).then(data => {

    function checkOwners(game) {
        return game.Estimatedowners != '0 - 0' &&
        game.Estimatedowners != '0 - 20000' &&
        game.Estimatedowners != '20000 - 50000' &&
        game.Estimatedowners != '50000 - 100000' &&
        game.Estimatedowners != '100000 - 200000' &&
        game.Estimatedowners != '200000 - 500000';
    }

    let filteredData = data.filter(checkOwners);

    //console.log(filteredData); // Check if it loaded

    let releaseSortedData = filteredData.sort((a, b) => a.Releasedate - b.Releasedate);
    console.log(releaseSortedData);

    createScatterPlot(releaseSortedData);

});

function createScatterPlot(releaseSortedData) {
    const container = d3.select('#scatter-plot');
    const bounds = container.node().getBoundingClientRect();
    const width = bounds.width - scatterMargin.left - scatterMargin.right;
    const height = bounds.height - scatterMargin.top - scatterMargin.bottom;

    scatterSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${scatterMargin.left},${scatterMargin.top})`);

    const xScaleScatter = d3.scaleTime()
        .domain([new Date(1997, 0, 1), d3.max(releaseSortedData, d => d.Releasedate)])
        .range([0, width])
        .nice();

    const yScaleScatter = d3.scaleLinear()
        .domain([-2, d3.max(releaseSortedData, d => d.Price)])
        .range([height, 0])
        .nice();

    // Draw points
    scatterSvg.selectAll('.scatter-dot')
        .data(releaseSortedData)
        .join('circle')
        .attr('class', 'scatter-dot')
        .attr('cx', d => xScaleScatter(d.Releasedate))
        .attr('cy', d => yScaleScatter(d.Price))
        .attr('r', 4)
        .attr('opacity', 0.6)
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 8)
                .attr('opacity', 1);
            showScatterTooltip(event, d);
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 4)
                .attr('opacity', 0.6);
            hideTooltip();
        });

    // Axes
    scatterSvg.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScaleScatter).ticks(8));

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

    // Vertical gridlines (x-axis)
    scatterSvg.append('g')
        .attr('class', 'grid grid-x')
        .attr('transform', `translate(0,${height})`)
        .call(
            d3.axisBottom(xScaleScatter)
                .ticks(8)
                .tickSize(-height)   // extend ticks up the chart
                .tickFormat('')      // remove labels
        );

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
        .style('fill', '#1e293b')
        .text('Release Date vs Price');

}


function showScatterTooltip(event, d) {
    createTooltip(event, `
        <div class="stat">
            <span class="value">${d.Name}</span>
        </div>
        <div>
            <span>$${d.Price}</span>
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
        .style('left', (event.clientX + window.scrollX + 15) + 'px')
        .style('top',  (event.clientY + window.scrollY - 15) + 'px')
        .transition()
        .duration(200)
        .style('opacity', 1);
}

function hideTooltip() {
    d3.selectAll('.tooltip')
        .transition()
        .duration(200)
        .style('opacity', 0)
        .remove();
}