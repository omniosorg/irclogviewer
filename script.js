/*
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see http://www.gnu.org/licenses/.
 *
 * Copyright 2021 Matt Fiddaman
 */

const defaultchan = 'omnios';
const nick_col_override = {
	andyf:		'ooce',
	hadfl:		'ooce',
	oetiker:	'ooce',
	fenix:		'ooce',
	mrscowley:	'ooce',
};

// Taken from https://urlregex.com
const url_regex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[-+\.\!\/\\\w]*))?)/g;

let channel_regex = /#[-\w]+/g;
const escapere = /[.*+?^${}()|[\]\\]/g;
const actionre = /^\x01ACTION\s+(.*)\x01$/;
const linkre = /^(.*?)(<a\s.*<\/a>)(.*)$/;

const online = {};
const nick_classes = {};
const nick_regexps = {};
let channels = {};
let curchan, curdate;
let pik;
let lastkey;

const zero_pad = (num, places) => String(num).padStart(places, '0')

const loader = {
	show : () => {
		$('#container, #menu').hide();
		$('#loading_overlay, #loading_container').show();
	},
	hide : () => {
		$('#container, #menu').show();
		$('#loading_overlay, #loading_container').fadeOut();
	}
}

function format_date(d) {
	return String(
	    zero_pad(d.getFullYear(), 4) + '-' +
	    zero_pad(d.getMonth() + 1, 2) + '-' +
	    zero_pad(d.getDate(), 2));
}

function format_time(d) {
	if (localStorage.getItem('utc_setting') === 'true') {
		return String(
		    zero_pad(d.getUTCHours(), 2) + ':' +
		    zero_pad(d.getUTCMinutes(), 2) + ':' +
		    zero_pad(d.getUTCSeconds(), 2));
	} else {
		return String(
		    zero_pad(d.getHours(), 2) + ':' +
		    zero_pad(d.getMinutes(), 2) + ':' +
		    zero_pad(d.getSeconds(), 2));
	}
}

function fail_msg(msg) {
	$('#fail_msg').text(msg).removeClass('hidden');
}

function initialise_settings() {
	if (localStorage.getItem('darkmode') === 'true')
		$('#toggle_dl').trigger('click');

	$('#settings_overlay main .setting').each(function () {
		const id = $(this).find('input').attr('id');

		if (localStorage.getItem(id) === 'true')
			$(`#${id}`).prop('checked', true);
	});
}

function linkify(text) {
	return text.replaceAll(url_regex, (url) => {
		let href = url.replace(/\.$/, '');

		if (!url.includes('('))
			href = href.replace(/\)$/, '');

		const lhref = href.length;

		return '<a target="_blank" rel="noopener" href="'
		    + href + '">' + url.slice(0, lhref) + '</a>'
		    + url.slice(lhref);
	})
}

function channelify(text) {
	return text.replaceAll(channel_regex, (channel) => {
		return `<span class="channel_col">${channel}</span>`;
	})
}

function nickify(text) {
	for (const user in online) {
		text = text.replaceAll(nick_regexps[user],
		    nick_span(user, false).prop('outerHTML'));
	}

	return text;
}

function nick_class(nick) {
	const _nick = nick.replaceAll(/^_+|_+$/g, '');

	if (_nick in nick_col_override)
		return `nick_col_${nick_col_override[_nick]}`;

	let hash = 0;
	for (let i = 0; i < _nick.length; i++) {
		const char = _nick.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Truncate to 32-bits
	}

	return `nick_col_${Math.abs(hash % 8)}`;
}

function nick_span(nick, braces=true) {
	return $('<span/>')
	    .addClass(nick_classes[nick])
	    .text(braces ? `<${nick}>` : nick);
}

function jp_span(jp, nick) {
	return $('<span/>')
	    .addClass((jp ? 'join' : 'part') + '_col')
	    .append($('<span/>').text('*** '))
	    .append(nick_span(nick, false))
	    .append($('<span/>').text(' has ' + (jp ? 'joined' : 'left')
	        + ' the channel ***'));
}

function style_msg() {
	msg = $(this).html();

	if (msg.includes('://')) {
		msg = linkify(msg);
		let m;
		if ((m = msg.match(linkre)))
			msg = nickify(m[1]) + m[2] + nickify(m[3]);
	} else {
		msg = nickify(msg);
		if (msg.includes('#')) msg = channelify(msg);
	}

	$(this).html(msg);
}

function nologs() {
	if (!$('.log_row:visible').length) {
		$('#nologs')
		    .removeClass('hidden')
		    .show()
		    .find('span').text(`#${curchan}`)
		    .next('span').text(curdate);
	} else {
		$('#nologs').hide();
	}
}

function scroll_hash(hash) {
	$('div.hl').removeClass('hl');
	$(hash).addClass('hl').show();

	$('html, body').animate({
	    scrollTop: $(hash).offset().top - 60
	}, 500);
	document.location.hash = hash;
}

function switch_channel(pn) {
	const $current = $('#channels .channel_row.current');
	let $destination;

	if (pn) {
		$destination = $current.next();

		if($destination.length === 0)
			$destination = $('#channels .channel_row:first');
	} else {
		$destination = $current.prev();

		if($destination.length === 0)
			$destination = $('#channels .channel_row:last');
	}

	document.location.href =
	    `/${$destination.find('a').attr('data-channel')}/${curdate}`;
}

const handlers = {
	'JOIN': (v, r) => {
		r.find('.message').append(jp_span(true, v.nick));
	},
	'PART': (v, r) => {
		r.find('.message').append(jp_span(false, v.nick));
	},
	'PRIVMSG': (v, r) => {
		const $msg = r.find('.message')
		const $nick = r.find('.nick');

		let m;
		if (m = v.message.match(actionre)) {
			$nick.text('*');
			$msg.text(`${v.nick} ${m[1]}`);
		} else {
			$nick.append(nick_span(v.nick));
			$msg.text(v.message);
		}
	},
};

$(() => {
	if('serviceWorker' in navigator)
		navigator.serviceWorker.register('/sw.js')

	const path = document.location.pathname;

	$('#toggle_sys').on('click', function(e) {
		var $rows =
		    $('.log_row[data-cmd="PART"], .log_row[data-cmd="JOIN"]');

		$(this).toggleClass('on off');
		localStorage.setItem('hidesys', $(this).hasClass('on'));

		if ($(this).hasClass('on')) {
			$(this).find('span').text(
			    `${$rows.length} join/part message` +
			    ($rows.length == 1 ? "" : "s") + ' not shown');
			$rows.hide();
		} else {
			$(this).find('span').text('');
			$rows.fadeIn(400);
		}
		nologs();
	});

	$('#toggle_dl').on('click', function(e) {
		$icon = $(this).find('i');

		if ($icon.hasClass('fas'))
			$('html').removeAttr('dark');
		else
			$('html').attr('dark', 'true');

		$icon.toggleClass('fas far');

		localStorage.setItem('darkmode', $icon.hasClass('fas'));
	});

	$('#utc_setting').on('click', function(e) {
		localStorage.setItem('utc_setting', $(this).is(':checked'));
		window.location.reload(false);
	});

	if (localStorage.getItem('darkmode') === null) {
		localStorage.setItem('darkmode',
		    window.matchMedia('(prefers-color-scheme: dark)').matches);
	}

	initialise_settings();

	loader.show();

	$.getJSON('/api/channel', (data) => {
		const $template = $('#channel_line');
		const $channels = $('#channels');
		channels = data;

		$.each(data, (k, v) => {
			const channel = k;

			const row = $template.clone()
			    .attr('id', `channel_${channel}`);

			row.find('.channel')
			    .text(`#${channel}`)
			    .attr('data-channel', channel);

			row.removeClass('hidden');

			$channels.append(row);
		});
	}).fail((err) => {
		fail_msg('Error fetching channels');

		loader.hide();
	}).done(() => {

	const today = format_date(new Date());

	let result;
	if ((result = path.match(/^\/([-a-z]+)\/(\d{4}-\d{2}-\d{2})$/i)) &&
	    result[1] in channels) {
		curchan = result[1];
		curdate = result[2];
	} else if ((result = path.match(/^\/([-a-z]+)/i)) &&
	    result[1] in channels) {
		window.location.href = `/${result[1]}/${today}`;
		return;
	} else {
		window.location.href = `/${defaultchan}/${today}`;
		return;
	}

	const api_location = `/api${path}`;

	document.title = `#${curchan} on ${curdate}`;
	$('#title').find('span').text(`#${curchan}`);

	$('#channels a.channel').each(function () {
		$(this).attr('href',
		    `/${$(this).attr('data-channel')}/${curdate}`);

		if ($(this).attr('data-channel') === curchan)
			$(this).parent('div').addClass('current');
	});


	try {
		const $topic = $('#topic');
		$topic.text(channels[curchan].topic);
		$topic.html(linkify($topic.html()));
	} catch (err) {
		console.error(err);
	}

	channel_regex = new RegExp(
	    `#(?:${Object.keys(channels).join('|')})\\b`, 'g');

	pik = new Pikaday({
		field: $('#datepicker')[0],
		firstDay: 1,
		defaultDate: new Date(curdate),
		setDefaultDate: true,
		minDate: new Date(channels[curchan]['begin']),
		maxDate: new Date(),
		format: 'YYYY-MM-DD',
		showDaysInNextAndPreviousMonths: true,
		enableSelectionDaysInNextAndPreviousMonths: true,
		onSelect: (date) => {
			$('#datepicker').prop('disabled', true);
			document.location.href = `/${curchan}/`
			    + pik.toString();
		},
	});

	if (channels[curchan]['begin'] == curdate)
		$('#date_dec').prop('disabled', true).addClass('disabled');
	else if (curdate == today)
		$('#date_inc').prop('disabled', true).addClass('disabled');

	$.getJSON(api_location, (data) => {
		const $template = $('#log_line');
		const $logs = $('#logs');
		let longest_nick = 0;

		$.each(data, (k, v) => {
			const nick = v.nick;

			// This is done here so that we don't count nicks
			// only used in JOIN/PART messages against the
			// required width of the nick column.
			if (v.command == 'PRIVMSG') {
				longest_nick =
				    Math.max(longest_nick, nick.length);
			}

			if (nick in online) return

			online[nick] = true;
			nick_classes[nick] = nick_class(nick);

			try {
				const safe_nick = nick.replace(
				    escapere, '\\$&');
				nick_regexps[nick] = new
				    RegExp(`\\b${safe_nick}\\b`,
				    'g')
			} catch (err) {
				fail_msg('Invalid characters found in nickname');
				loader.hide();

				throw(err);
			}
		});

		$.each(data, (k, v) => {
			const id = `${v['ts']}${k}`;

			const row = $template.clone().attr('id', id);

			const ts = format_time(new Date(v.ts * 1000));

			row.find('.ts').html(`[${ts}]`);
			row.find('.ts_link').attr('href', `#${id}`);
			row.attr('data-cmd', v.command);

			row.find('.nick').attr('data-nick', v.nick);

			if (v.command in handlers) {
				handlers[v.command](v, row);
			} else {
				row.find('.message')
				    .text(`UNHANDLED ${v.command}`);
			}

			row.removeClass('hidden');

			$logs.append(row);
		});

		$('#logs .log_row .nick').on('click', function () {
			const nick = $(this).attr('data-nick');

			$(`#logs .log_row .nick[data-nick='${nick}']`)
			    .parent('div.log_row')
			    .removeClass('hl')
			    .toggleClass('hlu');
		});

		$logs.append($('<span/>').attr('id', 'end'));

		$('#logs .log_row .nick')
		    .css('min-width', `${longest_nick + 2}ch`);

		$('.message').each(style_msg);

		if (localStorage.getItem('hidesys') === 'true')
			$('#toggle_sys').trigger('click');

		$('a.ts_link').on('click', function(e) {
			e.preventDefault();

			if ($(this).parent('.log_row').hasClass('hl')) {
				$(this).parent('.log_row').removeClass('hl');
				document.location.hash = '+';

				return;
			}

			scroll_hash($(this).attr('href'));
		});

		loader.hide();
		nologs();

		if (document.location.hash)
			scroll_hash(document.location.hash);

	}).fail((err) => {
		loader.hide();
		nologs();
	});

	$('#date_today').on('click', () => {
		pik.setDate(today);
	});

	$('#date_inc').on('click', function() {
		if ($(this).prop('disabled')) return;
		pik.setMoment(pik.getMoment().add(1, 'days'));
	});

	$('#date_dec').on('click', function() {
		if ($(this).prop('disabled')) return;
		pik.setMoment(pik.getMoment().subtract(1, 'days'));
	});

	$('#scroll_down').on('click', () => {
		$('html, body').animate({
		    scrollTop: $('#log_end').offset().top
		}, 1000);
	});

	$('#scroll_up').on('click', () => {
		$('html, body').animate({
		    scrollTop: $('#logs .log_row:first').offset().top - 35
		}, 500);
	});

	$('#refresh').on('click', () => {
		window.location.href = path +
		    $('a.ts_link:visible:last').attr('href');
		window.location.reload(false);
	});

	$('#toggle_help, #help_overlay > header').on('click', () => {
		if ($('#settings_overlay:visible').length) return;
		$('#overlay, #help_overlay').toggle();
	});

	$('#toggle_settings, #settings_overlay > header').on('click', () => {
		if ($('#help_overlay:visible').length) return;
		$('#overlay, #settings_overlay').toggle();
	});

	window.onkeydown = (e) => {
		if (e.altKey || e.ctrlKey || e.metaKey) return;

		if (e.shiftKey) {
			switch (e.key) {
				case '?':
					$('#toggle_help').trigger('click');
					break;
				case '<':
					switch_channel(false);
					break;
				case '>':
					switch_channel(true);
					break;
				default: return;
			}
		}

		switch(e.key) {
			case 'Escape':
				$('#overlay > * > header:visible')
				    .trigger('click');
				break;
			case 'Left':
			case 'ArrowLeft':
				$('#date_dec').trigger('click');
				break;
			case 'Right':
			case 'ArrowRight':
				$('#date_inc').trigger('click');
				break;
			case 't':
				$('#date_today').trigger('click');
				break;
			case 'd':
				$('#toggle_dl').trigger('click');
				break;
			case 'r':
				$('#refresh').trigger('click');
				break;
			case 'm':
				$('#toggle_sys').trigger('click');
				break;
			case 's':
				$('#toggle_settings').trigger('click');
				break;
			case 'c': break;
			default: return;
		}

		last_key = e.key;
		e.preventDefault();
	};

	});
});

