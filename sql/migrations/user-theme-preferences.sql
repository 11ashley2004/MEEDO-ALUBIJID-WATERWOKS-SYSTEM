-- Per-user theme choice for the signed-in website.
-- light and dark are explicit. system follows the computer setting.

CREATE TABLE IF NOT EXISTS public.user_theme_preferences (
    user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    theme      TEXT NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_theme_preferences_theme_check
        CHECK (theme IN ('light', 'dark', 'system'))
);

ALTER TABLE public.user_theme_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_theme_preferences_select_own ON public.user_theme_preferences;
CREATE POLICY user_theme_preferences_select_own
    ON public.user_theme_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_theme_preferences_insert_own ON public.user_theme_preferences;
CREATE POLICY user_theme_preferences_insert_own
    ON public.user_theme_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_theme_preferences_update_own ON public.user_theme_preferences;
CREATE POLICY user_theme_preferences_update_own
    ON public.user_theme_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_theme_preferences TO authenticated;
