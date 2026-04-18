(function () {
    // ISO numeric IDs for visited countries
    const visitedIds = new Set([
        380,  // Italy
        756,  // Switzerland
        250,  // France
        276,  // Germany
        40,   // Austria
        724,  // Spain
        620,  // Portugal
        56,   // Belgium
        528,  // Netherlands
        578,  // Norway
        208,  // Denmark
        300,  // Greece
        792,  // Turkey
        826,  // United Kingdom (incl. Scotland)
        642,  // Romania
        392,  // Japan
        764,  // Thailand
        156,  // China
    ]);

    const visitedNames = [
        '🇮🇹 Italy','🇨🇭 Switzerland','🇫🇷 France','🇩🇪 Germany',
        '🇦🇹 Austria','🇪🇸 Spain','🇵🇹 Portugal','🇧🇪 Belgium',
        '🇳🇱 Netherlands','🇳🇴 Norway','🇩🇰 Denmark','🇬🇷 Greece',
        '🇹🇷 Turkey','🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland','🇷🇴 Romania','🇬🇧 UK',
        '🇯🇵 Japan','🇹🇭 Thailand','🇨🇳 China'
    ];

    // Render country pills
    const pillsContainer = document.getElementById('globe-countries');
    visitedNames.forEach(name => {
        const pill = document.createElement('span');
        pill.className = 'country-pill';
        pill.textContent = name;
        pillsContainer.appendChild(pill);
    });

    // Globe size
    const size = Math.min(480, window.innerWidth - 48);
    const svg = d3.select('#globe-svg')
        .attr('width', size)
        .attr('height', size);

    const projection = d3.geoOrthographic()
        .scale(size / 2 - 8)
        .translate([size / 2, size / 2])
        .clipAngle(90)
        .rotate([0, -25]);

    const pathGen = d3.geoPath().projection(projection);

    // Background sphere (ocean)
    svg.append('circle')
        .attr('cx', size / 2).attr('cy', size / 2)
        .attr('r', size / 2 - 8)
        .attr('fill', '#0d1b2a');

    // Graticule
    const graticule = d3.geoGraticule()();
    const gratPath = svg.append('path')
        .datum(graticule)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(99,102,241,0.08)')
        .attr('stroke-width', 0.5);

    // Country paths group
    const countryGroup = svg.append('g').attr('class', 'countries');
    // Pins group (on top)
    const pinGroup = svg.append('g').attr('class', 'pins');

    // Tooltip
    const tooltip = d3.select('body').append('div')
        .style('position', 'fixed')
        .style('background', 'rgba(30,30,34,0.95)')
        .style('border', '1px solid rgba(99,102,241,0.4)')
        .style('border-radius', '8px')
        .style('padding', '6px 14px')
        .style('font-size', '0.8rem')
        .style('font-family', "'JetBrains Mono', monospace")
        .style('color', '#c084fc')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .style('z-index', 9999)
        .style('transition', 'opacity 0.15s');

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(r => r.json())
        .then(world => {
            const countries = topojson.feature(world, world.objects.countries);

            // Draw countries
            const paths = countryGroup.selectAll('path')
                .data(countries.features)
                .join('path')
                .attr('d', pathGen)
                .attr('fill', d => visitedIds.has(+d.id) ? 'rgba(99,102,241,0.55)' : 'rgba(39,39,42,0.85)')
                .attr('stroke', 'rgba(99,102,241,0.2)')
                .attr('stroke-width', 0.5);

            // Draw pins on visited countries
            const pins = pinGroup.selectAll('circle')
                .data(countries.features.filter(d => visitedIds.has(+d.id)))
                .join('circle')
                .attr('r', 4)
                .attr('fill', '#818cf8')
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.2)
                .style('filter', 'drop-shadow(0 0 4px rgba(129,140,248,0.8))')
                .on('mousemove', function (event, d) {
                    tooltip
                        .style('left', (event.clientX + 14) + 'px')
                        .style('top', (event.clientY - 10) + 'px')
                        .style('opacity', 1)
                        .text(d.properties ? d.properties.name : ('Country ' + d.id));
                })
                .on('mouseleave', () => tooltip.style('opacity', 0));

            function updatePins() {
                pins.each(function (d) {
                    const centroid = d3.geoCentroid(d);
                    const proj = projection(centroid);
                    // Check if on front hemisphere
                    const rotate = projection.rotate();
                    const lon = centroid[0], lat = centroid[1];
                    const rLon = rotate[0], rLat = rotate[1];
                    const dot =
                        Math.cos((lat * Math.PI) / 180) *
                        Math.cos(((lon + rLon) * Math.PI) / 180) *
                        Math.cos((rLat * Math.PI) / 180) +
                        Math.sin((lat * Math.PI) / 180) *
                        Math.sin((-rLat * Math.PI) / 180);

                    d3.select(this)
                        .attr('cx', proj ? proj[0] : -999)
                        .attr('cy', proj ? proj[1] : -999)
                        .attr('opacity', dot > 0.1 ? 1 : 0);
                });
            }

            function update() {
                paths.attr('d', pathGen);
                gratPath.attr('d', pathGen);
                updatePins();
            }

            // Auto rotation
            let rotating = true;
            d3.timer(() => {
                if (!rotating) return;
                const r = projection.rotate();
                projection.rotate([r[0] + 0.18, r[1]]);
                update();
            });

            // Drag to rotate
            let dragStart = null;
            svg.call(
                d3.drag()
                    .on('start', event => {
                        rotating = false;
                        dragStart = { x: event.x, y: event.y, rotate: [...projection.rotate()] };
                    })
                    .on('drag', event => {
                        if (!dragStart) return;
                        const dx = event.x - dragStart.x;
                        const dy = event.y - dragStart.y;
                        projection.rotate([
                            dragStart.rotate[0] + dx * 0.4,
                            Math.max(-60, Math.min(60, dragStart.rotate[1] - dy * 0.4))
                        ]);
                        update();
                    })
                    .on('end', () => {
                        setTimeout(() => { rotating = true; }, 1200);
                    })
            );

            update();
        });
})();

