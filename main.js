// Date
var startDate = '2007-01-01';
var endDate = '2022-12-31';
var year_start = 2007;  
var year_end = 2022;

// Location
var lon = 105.0833333;
var lat = 9.583333333;

var point = ee.Geometry.Point([lon, lat]).buffer(100);


function calculateChlo(image) {
    var band3 = image.select('Nadir_Reflectance_Band3');   // Red band
    var band4 = image.select('Nadir_Reflectance_Band4');   // Near-Infrared band
    var r = image.expression(
        "log10(B3 / B4)", 
        { 
            'B3': band3,
            'B4': band4
        }
    ).rename('R');

    var chlo = image.expression(
        "10 ** (A0 + A1 * R + A2 * (R ** 2) + A3 * (R ** 3)) + A4",
        {
            'A0': 0.354,
            'A1': -2.8009,
            'A2': 2.902,
            'A3': -1.977,
            'A4': 0.0750,
            'R': r
        }
    ).toFloat().rename('CHLO');

    return image.addBands(chlo);
}


// Function to add date information to each image
function addDate(image) {
    var date = ee.Date(image.get('system:time_start'));
    return image.set('month', date.get('month'), 'year', date.get('year'));
}

// Filter the Sentinel-2 image collection for the given point and time range


var s2Collection = ee.ImageCollection('MODIS/061/MCD43A4')
    .filterDate(startDate, endDate).sort('system:time_start')
    .filterBounds(point)
    .map(calculateChlo)
    .map(addDate);

// Group images by month and calculate the average chlorophyll value
var months = ee.List.sequence(1, 12);
var years = ee.List.sequence(year_start,year_end);

var yrMo = ee.ImageCollection.fromImages(
  years.map(function (y) {
        return months.map(function (m) {
            return s2Collection
              .filter(ee.Filter.calendarRange(y, y, 'year'))
              .filter(ee.Filter.calendarRange(m, m, 'month'))
              .mean()
              .set('year',y)
              .set('month',m);
        });
    }).flatten());
    
function extractMonthlyChlo(image) {
    var value = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: point,
        scale: 10
    }).get('CHLO');

    return ee.Feature(null, { 
        'month': image.get('month'), 
        'year': image.get('year'), 
        'avg_CHLO': value 
    });
}

var monthlyChloValues = yrMo.map(extractMonthlyChlo);
print(monthlyChloValues.limit(50));

Export.table.toDrive({
  collection: monthlyChloValues,
  description: 'MonthlyChlorophyllValues',
  fileFormat: 'CSV'
});
