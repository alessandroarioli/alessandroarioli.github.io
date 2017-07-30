// Bar chart
new Chart(document.getElementById("skillsChart"), {
    type: 'bar',
    data: {
      labels: ["Ruby on Rails", "JavaScript", "Python", "Swift", "GoLang", "C#"],
      datasets: [
        {
          label: "Power: ",
          backgroundColor: ["#c45850", "#3e95cd", "#FFFF00","#e8c3b9","#FFFF99"],
          data: [75, 70, 65, 45, 40, 35]
        }
      ]
    },
    options: {
      legend: { display: false },
      scales: {
        yAxes: [{
            display: true,
            ticks: {
                beginAtZero: true
            }
        }]
    }
    }
});