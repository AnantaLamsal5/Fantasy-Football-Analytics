def fantasy_notification_email(notification, user):
    """Return reusable subject/body text for fantasy alerts."""
    subject = notification.get('email_subject') or notification.get('title') or 'Fantasy Football update'
    username = user.get_full_name() or user.username or 'Manager'
    message = notification.get('email_body') or notification.get('message') or 'You have a new fantasy update.'
    notification_type = (notification.get('type') or 'update').replace('_', ' ').title()

    body = (
        f"Hi {username},\n\n"
        f"{message}\n\n"
        f"Alert type: {notification_type}\n\n"
        "Open your Fantasy Football dashboard to review your team, transfers, and upcoming fixtures.\n\n"
        "Good luck,\n"
        "Fantasy Football"
    )
    return subject, body


def weekly_summary_email(team, user):
    username = user.get_full_name() or user.username or 'Manager'
    latest_week = None
    latest_points = 0
    for key in sorted([int(k) for k in (team.weekly_points or {}).keys() if str(k).isdigit()]):
        latest_week = key
        latest_points = int((team.weekly_points or {}).get(str(key), 0))

    subject = 'Weekly fantasy performance summary'
    body = (
        f"Hi {username},\n\n"
        f"Your current fantasy total is {team.points} points."
    )
    if latest_week is not None:
        body += f" Matchweek {latest_week} added {latest_points} points."
    body += (
        f"\n\nCurrent rank: {team.rank or 'N/A'}\n"
        f"Remaining budget: EUR {float(team.budget):,.0f}\n\n"
        "Keep an eye on the transfer deadline and your watchlist before the next kickoff.\n\n"
        "Fantasy Football"
    )
    return subject, body
