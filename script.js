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
	mattfidd:	'ooce',
	fenix:		'bot',
	mrscowley:	'bot',
	gitomat:	'bot',
	jinni:		'bot',
};

// Taken from https://urlregex.com
const url_regex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+:~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[-+\.\!\/\\\w]*))?)/g;

let channel_regex = /#[-\w]+/g;
const escapere = /[.*+?^${}()|[\]\\]/g;
const actionre = /^\x01ACTION\s+(.*)\x01$/;
const linkre = /^(.*?)(<a\s.*<\/a>)(.*)$/;

let online = {};
let nick_classes = {};
let nick_regexps = {};
let channels = {};
let curchan, curdate;
let pik;
let lastkey;
let chansel = false;
let picker_open = false;
let today;

(function($) {
	$.fn.enable = function()
	{
		return this.each(function() {
			$(this)
			    .removeClass('disabled')
			    .prop('disabled', false)
			    .disabled = false;
		});
	};

	$.fn.disable = function()
	{
		return this.each(function() {
			$(this)
			    .addClass('disabled')
			    .prop('disabled', true)
			    .disabled = true;
		});
	};
})(jQuery);

const zero_pad = (num, places) => String(num).padStart(places, '0')

const loader = {
	show : (large = true) => {
		if (large) {
			$('#container, #menu').hide();
			$('#loading_overlay, #loading_container').show();
		} else {
			$('#mini_loader').show();
		}

	},
	hide : () => {
		$('html, body').scrollTop(0);
		$('#container, #menu').show();
		$('#title span').width($('#channels').width());
		nologs();
		$('#loading_overlay, #loading_container').fadeOut();
		$('#mini_loader').hide();
	}
}

function format_date(d) {
	return String(
	    zero_pad(d.getUTCFullYear(), 4) + '-' +
	    zero_pad(d.getUTCMonth() + 1, 2) + '-' +
	    zero_pad(d.getUTCDate(), 2));
}

function format_time(d) {
	if (localStorage.getItem('utc_setting') === 'true') {
		return String(
		    zero_pad(d.getUTCHours(), 2) + ':' +
		    zero_pad(d.getUTCMinutes(), 2) + ':' +
		    zero_pad(d.getUTCSeconds(), 2) + 'Z');
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
	if (localStorage.getItem('darkmode') === null) {
		localStorage.setItem('darkmode',
		    window.matchMedia('(prefers-color-scheme: dark)').matches);
	}

	if (localStorage.getItem('hidesys') === 'true')
		$('#toggle_sys').toggleClass('on off');

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

	return `nick_col_${Math.abs(hash % 15)}`;
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

function scroll_hash(hash, hl = true) {
	$('div.hl').removeClass('hl');

	if (hl) {
		$(hash).addClass('hl').show();
		history.replaceState(null, null, hash);
	}

	$('html, body').animate({
	    scrollTop: $(hash).offset().top - 60
	}, 500);
}

function switch_channel(pn) {
	const $current = $('#channels .current');
	let $destination;

	if (pn) {
		$destination = $current.next();

		if($destination.length === 0)
			$destination = $('#channels div:first');
	} else {
		$destination = $current.prev();

		if($destination.length === 0)
			$destination = $('#channels div:last');
	}

	draw_logs($destination.attr('data-channel'), curdate);
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

async function draw_logs(chan = curchan, date = curdate) {
	$('#date_dec, #date_inc').disable();
	loader.show(false);

	document.title = `#${chan} on ${date}`;
	if (curdate !== date || curchan !== chan) {
		window.history.pushState("history", document.title,
		    `/${chan}/${date}`);
	}

	curdate = date;
	curchan = chan;
	today = format_date(new Date());

	$('#title').find('span').text(`#${chan}`);

	$('#channels > div')
	    .removeClass('current')
	    .each(function() {
		$(this).find('a').attr('href',
		    `/${$(this).attr('data-channel')}/${curdate}`);

		if ($(this).attr('data-channel') === curchan)
			$(this).addClass('current');
	});

	const $topic = $('#topic');
	$topic.text(channels[chan].topic);
	$topic.html(linkify($topic.html()));

	$('#logs').empty();
	$('.fail_msg').hide();
	online = {};
	nick_classes = {};
	nick_regexps = {};

	let log_data;
	try {
		log_data = await $.getJSON(`/api/${chan}/${date}`);
	} catch (e) {
		$('#date_dec, #date_inc').enable();
		loader.hide();
		return;
	}

	const $template = $('#log_line');
	const $logs = $('#logs');
	let longest_nick = 0;

	$.each(log_data, (k, v) => {
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

	let last_ts = 0;
	let index = 0;
	$.each(log_data, (k, v) => {
		if (v['ts'] == last_ts) {
			index++;
		} else {
			index = 0;
			last_ts = v['ts'];
		}

		const id = `${v['ts']}${index}`;

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
		    .toggleClass('hlu');
	});

	$logs.append($('<span/>').attr('id', 'end'));

	$('#logs .log_row .nick')
	    .css('min-width', `${longest_nick + 2}ch`);

	$('.message').each(style_msg);

	if ($('#toggle_sys').hasClass('on')) {
		$('#toggle_sys')
		    .toggleClass('on off')
		    .trigger('click');
	}

	$('a.ts_link').on('click', function(e) {
		e.preventDefault();

		if ($(this).parent('.log_row').hasClass('hl')) {
			$(this).parent('.log_row').removeClass('hl');
			history.replaceState(null, null,
			    document.location.pathname);

			return;
		}

		scroll_hash($(this).attr('href'));
	});

	if (channels[chan]['begin'] !== curdate)
		$('#date_dec').enable();
	if (date !== today)
		$('#date_inc').enable();

	loader.hide();

	if (document.location.hash)
		scroll_hash(document.location.hash);
	else if (curdate == today) {
		const last = localStorage.getItem(`${curchan}-last`);
		const $last = $(`#${last}`);
		const nlast = $('#logs .log_row:last').attr('id');

		if (!last === false && $last.length !== 0) {
			if (last != nlast)
				$last.after('<hr/>');

			let scroll_to = last;

			if ($last.is(':hidden')) {
				let $prev = $last
				do {
					$prev = $prev.prev();
				} while ($prev.length && $prev.is(':hidden'));

				scroll_to = $prev.attr('id');
			}

			scroll_hash(`#${scroll_to}`, false);
		}

		localStorage.setItem(`${curchan}-last`, nlast);
	}
}

$(async () => {
	if('serviceWorker' in navigator)
		navigator.serviceWorker.register('/sw.js')

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
		$('#toggle_settings').trigger('click');
		draw_logs();
	});

	initialise_settings();

	loader.show();

	try {
		channels = await $.getJSON('/api/channel');
	} catch (e) {
		fail_msg('Error fetching channels');
		loader.hide();
	}

	const $template = $('#channel_line');
	const $channels = $('#channels');

	$.each(channels, (k, v) => {
		const channel = k;

		const row = $template.clone()
		    .removeAttr('id')
		    .attr('data-channel', channel);

		row.find('.channel')
		    .text(`#${channel}`);

		row.removeClass('hidden');

		$channels.append(row);
	});

	const path = document.location.pathname;
	today = format_date(new Date());

	let result;
	if ((result = path.match(/^\/([-a-z]+)\/(\d{4}-\d{2}-\d{2})$/i)) &&
	    result[1] in channels) {
		curchan = result[1];
		curdate = result[2];
	} else if ((result = path.match(/^\/([-a-z]+)/i)) &&
	    result[1] in channels) {
		document.location.href = `/${result[1]}/${today}`;
		return;
	} else {
		document.location.href = `/${defaultchan}/${today}`;
		return;
	}

	channel_regex = new RegExp(
	    `#(?:${Object.keys(channels).join('|')})\\b`, 'g');

	draw_logs();

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
		onSelect: (date) => { draw_logs(curchan, pik.toString()); },
		onOpen: () => { picker_open = true; },
		onClose: () => { picker_open = false; }
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
		history.replaceState(null, null, document.location.pathname);
		draw_logs();
	});

	$('#toggle_help, #help_overlay > header').on('click', () => {
		if ($('#settings_overlay:visible').length) return;
		$('#overlay, #help_overlay').toggle();
	});

	$('#toggle_settings, #settings_overlay > header').on('click', () => {
		if ($('#help_overlay:visible').length) return;
		$('#overlay, #settings_overlay').toggle();
	});

	$('#channels').on('click', 'div', function(e) {
		e.preventDefault();
		draw_logs($(this).attr('data-channel'), curdate);
	});

	const chansel_keys = (e) => {
		const $cur = $('#channels div.sel:first');
		let $next;

		if (e.shiftKey)
			return;

		e.preventDefault();

		switch(e.key) {
		    case 'c':
		    case 'Down':
		    case 'ArrowDown':
			$next = $cur.next();
			if (!$next.length)
				$next = $('#channels div:first');
			$cur.removeClass('sel');
			$next.addClass('sel');
			break;
		    case 'Up':
		    case 'ArrowUp':
			$next = $cur.prev();
			if (!$next.length)
				$next = $('#channels div:last');
			$cur.removeClass('sel');
			$next.addClass('sel');
			break;
		    case ' ':
		    case 'Enter':
			draw_logs($cur.attr('data-channel'), curdate);
			// Fall-through
		    case 'Escape':
			$cur.removeClass('sel');
			chansel = false;
			break;
		    default:
			$next = $cur
			    .next(`div[data-channel^="${e.key}"]`);
			if (!$next.length)
				$next = $(`div[data-channel^="${e.key}"]`)
				    .first();
			if ($next.length) {
				$cur.removeClass('sel');
				$next.addClass('sel');
			}
			break;
		}
	};

	window.onkeydown = (e) => {
		if (e.altKey || e.ctrlKey || e.metaKey)
			return;

		if (chansel)
			return chansel_keys(e);

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
		    default:
			if (e.shiftKey)
				return;

			switch(e.key) {
			    case 'Escape':
				$('#overlay > * > header:visible')
				    .trigger('click');
				break;
			    case 'Left':
			    case 'ArrowLeft':
				if (!picker_open)
					$('#date_dec').trigger('click');
				break;
			    case 'Right':
			    case 'ArrowRight':
				if (!picker_open)
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
			    case 'c':
				$('#channels div.current').addClass('sel');
				chansel = true;
				break;
			    default:
				return;
			}
		}

		last_key = e.key;
		e.preventDefault();
	};
});

