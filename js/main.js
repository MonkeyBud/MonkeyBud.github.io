d3.csv("data/games.csv", row => {

    
    row.AppID = Number(row.AppID);
    console.log(row);
    return row;
}).then(data => {
    console.log(data); // Check if it loaded

});