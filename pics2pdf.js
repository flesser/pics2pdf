/* ========================================================================
 * pics2pdf.js v1.0.5
 * https://flesser.github.io/pics2pdf
 * ========================================================================
 * Copyright 2015 Florian Eßer
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ======================================================================== */


function fitImage(img, maxLong, maxShort) {
    maxShort = maxShort || maxLong;
    if (img.width > img.height) {
        if (img.width <= maxLong && img.height <= maxShort) {
            // no resizing necessary
            return [img.width, img.height];
        }
        var widthRatio = maxLong / img.width;
        var heightRatio = maxShort / img.height;
    } else {
        if (img.height <= maxLong && img.width <= maxShort) {
            // no resizing necessary
            return [img.width, img.height];
        }
        var widthRatio = maxShort / img.width;
        var heightRatio = maxLong / img.height;
    }

    var resizeRatio = Math.min(widthRatio, heightRatio);

    return [img.width * resizeRatio, img.height * resizeRatio];
}


/**********************************************************************************************************************/


function rotateThumbnail(thumbnail, direction) {
    $('.image-button-rotate').addClass('disabled');
    thumbnail.spin({direction: direction});
    thumbnail.data('rotation', ((thumbnail.data('rotation') || 0) + direction + 4) % 4);

    var img = thumbnail.children('img')[0];
    var canvas = document.createElement('canvas');

    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    var context = canvas.getContext("2d");
    context.translate(canvas.width/2, canvas.height/2);
    context.rotate(direction * Math.PI/2);
    context.drawImage(img, -canvas.height/2, -canvas.width/2);

    img.src = canvas.toDataURL("image/jpeg");
    img.onload = function() {
        thumbnail.spin(false);
        $('.image-button-rotate').removeClass('disabled');
    }
}


/**********************************************************************************************************************/


function getImageFromFile(f, next) {
    var imageContainer = $('<div class="col-xs-6 col-sm-4 col-md-3 col-lg-2 center-block image-container"></div>');
    var thumbnail = $('<div class="thumbnail text-center"></div>').appendTo(imageContainer);
    var buttons = $('<div class="image-overlay image-buttons"></div>').appendTo(thumbnail);
    thumbnail.append($('<p class="image-caption">' + f.name + '</p>'));
    thumbnail.spin();

    var rotateLeftButton = $('<button class="btn btn-default image-button-rotate image-button-rotate-left" title="rotate left">'
    + '<i class="fa fa-rotate-left" aria-hidden="true"></i></button>').appendTo(buttons);
    rotateLeftButton.click(function() {
        rotateThumbnail(thumbnail, -1);
    });

    var rotateRightButton = $('<button class="btn btn-default image-button-rotate image-button-rotate-right" title="rotate right">'
    + '<i class="fa fa-rotate-right" aria-hidden="true"></i></button>').appendTo(buttons);
    rotateRightButton.click(function() {
        rotateThumbnail(thumbnail, 1);
    });

    var deleteButton = $('<button class="btn btn-danger image-button-remove" title="remove">'
    + '<i class="fa fa-trash-o" aria-hidden="true"></i></button>').appendTo(buttons);
    deleteButton.click(function() {
        $(this).parent().parent().parent().fadeOut('', function() {
            $(this).next('.clear').remove();  // remove clear helper
            $(this).remove();  // remove image
            if ($(".thumbnail").length == 0) {
                $('#pdfbutton').addClass('disabled');
                $('#welcome').fadeIn();
            }
        });
    });

    $('#image-row').append(imageContainer);

    thumbnail.data('filesize', f.size);

    var reader = new FileReader();
    reader.onload = (function(thumbnail) {
        return function(e) {
            var imageFormat = e.target.result.substr(0, 16).split('/')[1].split(';')[0];
            if ($.inArray(imageFormat, ['jpeg', 'png', 'gif']) == -1) {
                delete this;
                imageContainer.remove();
                next();
                return;
            }
            var img = document.createElement('img');
            img.src = e.target.result;
            thumbnail.data('imagedata', e.target.result);
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var dimensions = fitImage(this, 500);
                canvas.width = dimensions[0];
                canvas.height = dimensions[1];
                canvas.getContext("2d").drawImage(this, 0, 0, canvas.width, canvas.height);

                var dataurl = canvas.toDataURL("image/jpeg");
                thumbnail.children('.image-caption').addClass('image-overlay');
                thumbnail.append($('<img class="img-responsive" src="' + dataurl + '" title="drag to reorder"/>'));
                thumbnail.spin(false);

                // add clearfix helper
                $('#image-row').append($('<div class="clear"></div>'));

                next();
            }
            delete this;
        };
    })(thumbnail);
    reader.readAsDataURL(f);
}

function createFileReaderTask(file) {
    return function(next){
        getImageFromFile(file, next);
    }
}


/**********************************************************************************************************************/


function handleFileSelect(evt) {
    var files = evt.target.files;

    var pageCount = 0;
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f.type.match('image.*')) continue;
        $(document).queue('fileReaderTasks', createFileReaderTask(f));
        pageCount++;
    }
    if (pageCount > 0) {
        $('#welcome').slideUp();
        $('#pdfbutton').addClass('disabled');
        $('#pdfbutton').html('<span class="glyphicon">&ensp;</span> &ensp; reading pictures...');
        $('#pdfbutton span').spin('small');
    }
    $('#status-pagecount').text(pageCount + ' pages');

    $(document).queue('fileReaderTasks', function() {
        // reset file input
        evt.target.value = null;
        $('#pdfbutton').removeClass('disabled');
        $('#pdfbutton').html('<i class="fa fa-file-pdf-o" aria-hidden="true"></i> Create PDF');

        var totalSize = 0;
        $(".thumbnail").each(function() {
            totalSize += $(this).data('filesize');
        });
        totalSize /= 1024*1024;
        $('#status-filesize').text('ca. ' + totalSize.toFixed(1) + ' MB');
    });
    $(document).dequeue('fileReaderTasks');
}


/**********************************************************************************************************************/


function addPdfPage(pdf, thumbnail, maxSize, next) {
    var imageData = thumbnail.data('imagedata');
    var rotation = thumbnail.data('rotation') || 0;
    var pageCount = $('.thumbnail').length;
    var currentPage = (pageCount - $(document).queue("pdfPageTasks").length) + 1;
    var percent = currentPage / pageCount * 100;

    $('#progress-bar').attr('aria-valuenow', percent);
    $('#progress-bar').width(percent + '%');
    $('#progress-label').text("page " + currentPage + " of " + pageCount + "...");

    var img = document.createElement('img');
    img.onload = function() {
        if (maxSize < Infinity || rotation != 0) {
            // resize and/or rotate
            var canvas = document.createElement('canvas');
            var dimensions = fitImage(this, maxSize);
            canvas.width = dimensions[rotation % 2];
            canvas.height = dimensions[(rotation + 1) % 2];
            var context = canvas.getContext("2d");
            context.translate(canvas.width/2, canvas.height/2);
            context.rotate(rotation * Math.PI/2);
            context.drawImage(this, -dimensions[0]/2, -dimensions[1]/2, dimensions[0], dimensions[1]);
            imageData = canvas.toDataURL("image/jpeg");
        } else {
            // don't resize or rotate
            var dimensions = [this.width, this.height];
        }

        var dpi = 300;  // TODO: maybe make this an option
        var pageWidth = dimensions[rotation % 2] / dpi;
        var pageHeight = dimensions[(rotation + 1) % 2] / dpi;
        pdf.addPage([pageWidth, pageHeight]);
        pdf.addImage(imageData, 'jpeg', 0, 0, pageWidth, pageHeight);
        next();
    }
    img.src = imageData;
}

function createPdfPageTask(pdf, thumbnail, maxSize) {
    return function(next) {
        addPdfPage(pdf, thumbnail, maxSize, next);
    }
}


/**********************************************************************************************************************/


function createPDF() {
    $('#pdfbutton').addClass('disabled');

    // initiate progress modal
    $(document).queue('pdfPageTasks', function(next) {
        $('#progress-bar').width('0%');
        $('#progress-label').text("preparing...");
        $('#progress-modal').modal({
            backdrop: 'static',
            keyboard: false
        }).one('shown.bs.modal', next );
    });

    // setup PDF document
    var pdf = jsPDF('l', 'in', 'a4');
    pdf.deletePage(1);

    var title = $('#pdfTitle').val();
    var filename = (title || 'output') + '.pdf';
    pdf.setProperties({
        title: title,
        subject: $('#pdfSubject').val(),
        author: $('#pdfAuthor').val(),
        creator: 'flesser.github.io/pics2pdf'
    });

    // should we resize images?
    if ($('input[name="resizeRadios"]:checked').val() == 1) {
        var maxSize = parseInt($('#maxImageSize').val());
        if (!maxSize) {
            // TODO: maybe nicer looking error modal?
            alert('Invalid pixel value for image size reduction!\nPlease check again under "Edit PDF Options".');
            return;
        }
    } else {
        maxSize = Infinity;
    }

    // queue page generation
    $(".thumbnail").each(function(i) {
        $(document).queue('pdfPageTasks', createPdfPageTask(pdf, $(this), maxSize));
    });

    // once everything is done, output PDF and reset UI
    $(document).queue('pdfPageTasks', function() {
        var isSafari = /^((?!chrome).)*safari/i.test(navigator.userAgent);
        if (isSafari) {
            // download doesn't work in Safari, see https://github.com/MrRio/jsPDF/issues/196
            // open inline instead
            pdf.output('dataurl');
        } else {
            // create a nice download with file name
            pdf.save(filename);
        }
        // reset UI
        $('#pdfbutton').removeClass('disabled');
        $('#progress-modal').modal('hide');
        $('#progress-bar').width('0%');
        $('#progress-bar').attr('aria-valuenow', 0);
    });

    // run queue
    $(document).dequeue('pdfPageTasks');
}


/**********************************************************************************************************************/


$(document).ready(function() {
    $('#image-input').bind('change', handleFileSelect);
    $('#image-row').sortable({
        items: "> .image-container",
        helper: 'clone',
        placeholder: 'col-xs-6 col-sm-4 col-md-3 col-lg-2 center-block image-container',
        start: function(e, ui) {
            // remove old clearfix helper
            ui.item.next().next('.clear').remove();
        },
        stop: function(e, ui) {
            // create new clearfix helper
            if(ui.item.prev('.clear').length > 0) {
                // dropped after clearfix helper --> create new one after
                ui.item.after($('<div class="clear"></div>'));
            } else if(ui.item.next('.clear').length > 0) {
                // dropped before clearfix helper --> create new one before
                ui.item.before($('<div class="clear"></div>'));
            }
        }
    });
    $('#pdfbutton').click(function() {
        if (!$(this).hasClass('disabled')) {
            createPDF();
        }
    });
});
