var num = 600;

$(window).bind('scroll', function () {
    if ($(window).scrollTop() > num) {
        $('#myNavbar').addClass('fixed');
    } else {
        $('#myNavbar').removeClass('fixed');
    }
});
